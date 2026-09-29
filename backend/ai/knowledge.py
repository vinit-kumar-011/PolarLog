"""
The retrieval half of RAG.

Loads markdown from backend/knowledge/, splits it into chunks, and finds
the chunks most relevant to a question.

Primary path:  semantic search over Jina embeddings.
Fallback path: TF-IDF keyword matching, if embeddings are unavailable.
"""

import os
import glob
import math

from ai import embeddings

KNOWLEDGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "knowledge",
)

_chunks = []
_sources = []
_vectors = None        # semantic path
_tfidf = None          # fallback path
_tfidf_matrix = None
_mode = "none"


# ---------------------------------------------------------------
# Loading
# ---------------------------------------------------------------

def _split(text, source):
    """Split on '## ' headings, keeping each section whole."""
    parts = []
    current = []

    for line in text.split("\n"):
        if line.startswith("## ") and current:
            parts.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)

    if current:
        parts.append("\n".join(current).strip())

    return [(p, source) for p in parts if len(p) > 80]


def _build_fallback():
    """TF-IDF index, used when embeddings can't be reached."""
    global _tfidf, _tfidf_matrix

    from sklearn.feature_extraction.text import TfidfVectorizer

    _tfidf = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
    _tfidf_matrix = _tfidf.fit_transform(_chunks)


def load():
    """Read the documents and build an index. Called once at startup."""
    global _chunks, _sources, _vectors, _mode

    _chunks = []
    _sources = []

    for path in sorted(glob.glob(os.path.join(KNOWLEDGE_DIR, "*.md"))):
        name = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as f:
            for chunk, source in _split(f.read(), name):
                _chunks.append(chunk)
                _sources.append(source)

    if not _chunks:
        print("[knowledge] No documents found in", KNOWLEDGE_DIR)
        _mode = "none"
        return 0

    # Try the good path first
    _vectors = embeddings.embed_documents(_chunks)

    if _vectors is not None:
        _mode = "semantic"
        print(f"[knowledge] Indexed {len(_chunks)} chunks from "
              f"{len(set(_sources))} documents - semantic search ready")
    else:
        _build_fallback()
        _mode = "keyword"
        print(f"[knowledge] Indexed {len(_chunks)} chunks from "
              f"{len(set(_sources))} documents - FALLBACK to keyword search "
              f"(embeddings unavailable)")

    return len(_chunks)


# ---------------------------------------------------------------
# Searching
# ---------------------------------------------------------------

def _cosine(a, b):
    """How closely two vectors point in the same direction. 1.0 = identical."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _search_semantic(question, top_k, min_score):
    query_vector = embeddings.embed_query(question)

    if query_vector is None:
        # The API died between startup and now - use keywords for this one
        if _tfidf is None:
            _build_fallback()
        return _search_keyword(question, top_k, min_score=0.05)

    scored = [
        (_cosine(query_vector, vec), i) for i, vec in enumerate(_vectors)
    ]
    scored.sort(reverse=True)

    return [
        {"text": _chunks[i], "source": _sources[i], "score": round(score, 3)}
        for score, i in scored[:top_k]
        if score >= min_score
    ]


def _search_keyword(question, top_k, min_score):
    from sklearn.metrics.pairwise import cosine_similarity

    scores = cosine_similarity(_tfidf.transform([question]), _tfidf_matrix)[0]
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

    return [
        {"text": _chunks[i], "source": _sources[i], "score": round(float(scores[i]), 3)}
        for i in ranked[:top_k]
        if scores[i] >= min_score
    ]


def search(question, top_k=3, min_score=0.35):
    """
    The most relevant chunks for a question.

    min_score default of 0.45 suits cosine similarity on embeddings.
    The keyword fallback uses its own, much lower, threshold.
    """
    if _mode == "semantic":
        return _search_semantic(question, top_k, min_score)
    if _mode == "keyword":
        return _search_keyword(question, top_k, min_score=0.05)
    return []


def as_context(question):
    """Retrieved passages, formatted for a prompt."""
    hits = search(question)
    if not hits:
        return ""
    return "\n\n".join(
        f"--- From {h['source']} ---\n{h['text']}" for h in hits
    )


def status():
    """For debugging - what mode are we actually in?"""
    return {
        "mode": _mode,
        "chunks": len(_chunks),
        "documents": len(set(_sources)),
    }