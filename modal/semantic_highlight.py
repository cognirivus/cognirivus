import os
import modal
from pydantic import BaseModel, Field
from typing import List, Optional

# Define the model ID
MODEL_ID = "zilliz/semantic-highlight-bilingual-v1"

# Define cache paths
CACHE_DIR = "/root/cache"
NLTK_DATA_DIR = "/root/nltk_data"


def download_model():
    from transformers import AutoModel

    # Download the model to the cache directory
    AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "torch",
        "transformers",
        "accelerate",
        "nltk",
        "einops",
        "fastapi[standard]",
    )
    .env({"HF_HOME": CACHE_DIR, "NLTK_DATA": NLTK_DATA_DIR})
    .run_commands(
        # Pre-download NLTK data required by the model
        f"python -m nltk.downloader -d {NLTK_DATA_DIR} punkt_tab"
    )
    .run_function(download_model)
)

app = modal.App("semantic-highlighter", image=image)

# --- Data Models ---


class HighlightRequest(BaseModel):
    query: str = Field(..., description="The question or search query")
    context: str = Field(
        ..., description="The text context or RAG chunk to search within"
    )
    threshold: float = Field(0.5, description="Probability threshold for highlighting")


class HighlightResponse(BaseModel):
    highlighted_sentences: List[str]
    sentence_probabilities: Optional[List[float]] = None


# --- Model Class ---

# @app.cls(gpu="T4")
@app.cls()
class Highlighter:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoModel

        print("Loading model...")
        self.model = AutoModel.from_pretrained(
            MODEL_ID, trust_remote_code=True, device_map="cpu"
        )
        self.model.eval()
        print("Model loaded successfully.")

    @modal.method()
    def process(self, query: str, context: str, threshold: float):
        # Run the model
        result = self.model.process(
            question=query,
            context=context,
            threshold=threshold,
            return_sentence_metrics=True,
        )

        # --- FIX: SANITIZE OUTPUT ---
        # We manually construct a standard dict with standard python types.
        # This prevents 'ModuleNotFoundError: No module named transformers_modules'
        # when the result is sent back to your local machine.

        probs = result.get("sentence_probabilities")
        if probs is not None:
            # Ensure probabilities are a simple list of floats
            probs = [float(p) for p in probs]

        return {
            "highlighted_sentences": [str(s) for s in result["highlighted_sentences"]],
            "sentence_probabilities": probs,
        }


# --- API Endpoint ---


@app.function()
@modal.fastapi_endpoint(method="POST", docs=True)
def highlight(item: HighlightRequest) -> HighlightResponse:
    highlighter = Highlighter()

    result = highlighter.process.remote(
        query=item.query, context=item.context, threshold=item.threshold
    )

    return HighlightResponse(
        highlighted_sentences=result["highlighted_sentences"],
        sentence_probabilities=result.get("sentence_probabilities"),
    )


# --- Local Test ---


@app.local_entrypoint()
def test_main():
    question = "What is Article 1?"
    context = """
    Part I - Article 1
    Name and Territory of the Union
    Current Version
    (1) India, that is Bharat, shall be a Union of States.
    (2) The States and the territories thereof shall be as specified in the First Schedule.
    (3) The territory of India shall comprise —
    (a) the territories of the States;
    (b) the Union territories specified in the First Schedule; and
    (c) such other territories as may be acquired.
    """

    print("Spinning up remote GPU...")
    highlighter = Highlighter()
    result = highlighter.process.remote(question, context, 0.5)

    print("\n--- Results ---")
    for sent in result["highlighted_sentences"]:
        print(f"Match: {sent}")
