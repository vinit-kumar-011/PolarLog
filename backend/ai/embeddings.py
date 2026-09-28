"""
Turning text into vectors, via Jina.

Handles batching, caching to disk, and failing quietly enough that
the caller can fall back to something else.
"""

import os
import json
import hashlib
import requests

import config

API_URL = "https://api.jina.ai/v1/embeddings"
CACHE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    ".embedding_cache.json",
)

BATCH_SIZE = 32      # texts per request
TIMEOUT = 20         # seconds before we give up and fall back

_cache = None


def _key(text):
    """A short, stable id for a piece of text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


def _load_cache():
    global _cache
    if _cache is not None:
        return _cache

    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                _cache = json.load(f)
            print(f"[embeddings] Cache loaded: {len(_cache)} vectors")
        except (json.JSONDecodeError, OSError):
            print("[embeddings] Cache unreadable, starting fresh")
            _cache = {}
    else:
        _cache = {}

    return _cache


def _save_cache():
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(_cache, f)
    except OSError as e:
        print(f"[embeddings] Could not save cache: {e}")


def _call_api(texts, task):
    """One request to Jina. Returns a list of vectors, or None on failure."""
    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {config.JINA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": config.JINA_MODEL,
                "task": task,
                "input": texts,
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        print(f"[embeddings] Network problem: {e}")
        return None

    if response.status_code != 200:
        print(f"[embeddings] API returned {response.status_code}: "
              f"{response.text[:200]}")
        return None

    try:
        data = response.json()["data"]
    except (KeyError, ValueError):
        print("[embeddings] Unexpected response shape")
        return None

    # The API may not preserve order - sort by index to be safe
    return [item["embedding"] for item in sorted(data, key=lambda d: d["index"])]


def embed_documents(texts):
    """
    Vectors for document chunks. Cached, so repeats are free.
    Returns None if anything fails.
    """
    cache = _load_cache()

    missing = [t for t in texts if _key(t) not in cache]

    if missing:
        print(f"[embeddings] {len(missing)} new chunks to embed "
              f"({len(texts) - len(missing)} already cached)")

        for i in range(0, len(missing), BATCH_SIZE):
            batch = missing[i:i + BATCH_SIZE]
            vectors = _call_api(batch, task="retrieval.passage")

            if vectors is None:
                return None

            for text, vector in zip(batch, vectors):
                cache[_key(text)] = vector

        _save_cache()
    else:
        print(f"[embeddings] All {len(texts)} chunks already cached")

    return [cache[_key(t)] for t in texts]


def embed_query(text):
    """
    A vector for one question. Not cached - questions rarely repeat exactly.
    Returns None if anything fails.
    """
    vectors = _call_api([text], task="retrieval.query")
    return vectors[0] if vectors else None