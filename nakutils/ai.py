"""Thin clients for the AI providers used by the chat and image endpoints."""

import requests

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_TIMEOUT = 20


def call_groq_chat(api_key, messages, model=GROQ_DEFAULT_MODEL, max_tokens=1024, temperature=None, timeout=DEFAULT_TIMEOUT):
    """Return the assistant reply text, or None when the call fails."""
    body = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if temperature is not None:
        body["temperature"] = temperature
    try:
        response = requests.post(
            GROQ_CHAT_URL,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            json=body,
            timeout=timeout,
        )
        if not response.ok:
            return None
        choices = response.json().get("choices") or [{}]
        return choices[0].get("message", {}).get("content")
    except Exception as exc:
        print(f"Groq API call error: {exc}")
        return None


def messages_to_gemini_contents(messages):
    contents = []
    for message in messages:
        if message.get("content"):
            role = "model" if message.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message["content"]}]})
    return contents


def call_gemini(api_key, model, sys_prompt, contents, max_tokens=1024, temperature=0.7, timeout=DEFAULT_TIMEOUT):
    """Call Gemini generateContent and return a (reply_text, payload) pair."""
    try:
        response = requests.post(
            f"{GEMINI_BASE_URL}/{model}:generateContent?key={api_key}",
            json={
                "system_instruction": {"parts": [{"text": sys_prompt}]},
                "contents": contents,
                "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
            },
            timeout=timeout,
        )
        payload = response.json()
    except Exception as exc:
        print(f"Gemini call exception: {exc}")
        return None, {}

    if not response.ok:
        return None, payload
    candidates = payload.get("candidates") or [{}]
    parts = candidates[0].get("content", {}).get("parts") or [{}]
    return parts[0].get("text"), payload


def call_gemini_text(api_key, sys_prompt, messages, model="gemini-1.5-flash", max_tokens=1024):
    contents = messages_to_gemini_contents(messages)
    if not contents:
        contents.append({"role": "user", "parts": [{"text": "Hello"}]})
    reply, _ = call_gemini(api_key, model, sys_prompt, contents, max_tokens=max_tokens)
    return reply
