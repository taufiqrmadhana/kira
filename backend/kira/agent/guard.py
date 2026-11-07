"""Guard user messages and keep credentials out of every visible response."""

import os
import re

from kira.config import settings

MAX_CHARS = 2000
_EXTRACT = re.compile(
    r"(system|developer|hidden)\s*(prompt|message|instruction)"
    r"|(ignore|disregard|forget|override)\s+(all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+)*(instructions?|rules|guardrails?|prompt)"
    r"|(abaikan|lupakan|lewati)\s+(semua\s+|seluruh\s+)?(instruksi|aturan|perintah|prompt)"
    r"|(reveal|show|print|repeat|dump|tampilkan|kasih(\s*tau|\s*lihat)?|bocorkan|tunjukkan|sebutkan)\s.{0,40}(prompt|instruksi|instructions?|aturan\s+kamu|your\s+rules)"
    r"|(api[\s_-]?key|secret\s*key|deepseek[\s_-]?key|kira_password|kira_secret|access\s*token|\.env\b)",
    re.I,
)
_ID_WORDS = re.compile(
    r"\b(aku|gw|gue|kamu|lu|apa|gimana|bagaimana|tolong|kasih|abaikan|semua|yang|nggak|gak|dong|aja|siapa)\b",
    re.I,
)
_OFF_TOPIC = re.compile(
    r"\b(menu\s+(mcdonald\w*|kfc)|siapa\s+presiden|who\s+is\s+the\s+president)\b", re.I
)
REFUSE_EXTRACT = "I can't share my instructions, keys or settings. I can help with reconciliation, match rates and the workflow."
REFUSE_EXTRACT_ID = "Aku nggak bisa membagikan instruksi, key, atau pengaturan sistem. Aku bisa bantu rekonsiliasi, match rate, dan workflow."


def check_message(text: str) -> str | None:
    """Return a fixed reply when the message should not reach the model."""
    indonesian = bool(_ID_WORDS.search(text))
    if len(text) > MAX_CHARS:
        return (
            "Pesannya terlalu panjang. Tulis beberapa kalimat, atau unggah datanya di Workflow."
            if indonesian
            else "That message is too long. Ask in a few sentences, or upload the data in Workflow."
        )
    if _EXTRACT.search(text):
        return REFUSE_EXTRACT_ID if indonesian else REFUSE_EXTRACT
    if _OFF_TOPIC.search(text):
        return (
            "Aku cuma bisa bantu soal rekonsiliasi dan KIRA. Mau cek match rate outlet?"
            if indonesian
            else "I help with reconciliation and KIRA. I can check your outlet match rates."
        )
    return None


def _secrets() -> list[str]:
    values = [
        getattr(settings, name, "")
        for name in ("openai_api_key", "deepseek_api_key", "auth_password", "secret")
    ]
    values += [
        os.getenv(name, "")
        for name in (
            "DEEPSEEK_API_KEY",
            "KIRA_PASSWORD",
            "KIRA_SECRET",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
        )
    ]
    return sorted({value for value in values if value}, key=len, reverse=True)


def scrub(text: str) -> str:
    for secret in _secrets():
        text = text.replace(secret, "[hidden]")
    return text


def scrub_value(value):
    """Scrub tool results and approval arguments as well as assistant prose."""
    if isinstance(value, str):
        return scrub(value)
    if isinstance(value, dict):
        return {scrub(str(key)): scrub_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [scrub_value(item) for item in value]
    return value


def untrusted(value, limit: int = 300):
    """Bound file values before including them as data in a model prompt."""
    if isinstance(value, str):
        return value[:limit]
    if isinstance(value, dict):
        return {str(key)[:limit]: untrusted(item, limit) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [untrusted(item, limit) for item in value]
    return value
