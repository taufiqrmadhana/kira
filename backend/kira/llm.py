"""Provider selection shared by Kira chat and optional workflow suggestions."""

import json

from kira.config import settings


def provider() -> str:
    model = settings.model.strip()
    if model.startswith("openai/") or model == "gpt-6.1-terra":
        return "openai"
    if model.startswith("deepseek/"):
        return "deepseek"
    return ""


def api_key() -> str:
    name = {"openai": "openai_api_key", "deepseek": "deepseek_api_key"}.get(provider())
    return getattr(settings, name, "").strip() if name else ""


def credentials_error() -> str | None:
    key_name = {"openai": "OPENAI_API_KEY", "deepseek": "DEEPSEEK_API_KEY"}.get(provider())
    if key_name and not api_key():
        return f"Kira needs a configured {key_name} before it can answer from the model."
    return None


def model_options() -> dict:
    """Keep the configured model; the Responses prefix is LiteLLM routing only."""
    model = settings.model.strip()
    if provider() == "openai":
        name = model.removeprefix("openai/").removeprefix("responses/")
        options = {
            "model": f"openai/responses/{name}",
            "api_key": api_key(),
            "store": False,
        }
        if name == "gpt-6.1-terra":
            # Terra supports none. ADK's chat-shaped history does not retain
            # encrypted Responses reasoning items; do not silently enable
            # reasoning until that history contract is supported end to end.
            options["reasoning_effort"] = "none"
        return options
    if provider() == "deepseek":
        return {"model": model, "api_key": api_key()}
    # Preserve existing ADK/LiteLLM routing for other explicitly configured
    # providers. Workflow suggestions only enable for the two keyed providers.
    return {"model": model}


def agent_model():
    from google.adk.models.lite_llm import LiteLlm, LiteLLMClient

    class ResponsesClient(LiteLLMClient):
        async def acompletion(self, model, messages, tools, **kwargs):
            # Preserve ADK's optional/default arguments and open-ended mapping
            # schemas. Responses otherwise attempts strict-schema normalization.
            prepared = (
                [
                    {**tool, "function": {**tool["function"], "strict": False}}
                    if tool.get("type") == "function" and isinstance(tool.get("function"), dict)
                    else tool
                    for tool in tools
                ]
                if tools
                else tools
            )
            return await super().acompletion(model, messages, prepared, **kwargs)

    options = model_options()
    if provider() == "openai":
        options["llm_client"] = ResponsesClient()
    return LiteLlm(**options, timeout=60, num_retries=0)


def json_completion(messages: list[dict], timeout: int, max_tokens: int | None = None) -> dict:
    """Request a JSON object; callers decide how optional-provider errors degrade."""
    import litellm

    options = model_options()
    if provider() != "openai":
        options["temperature"] = 0
    if max_tokens is not None:
        options["max_tokens"] = max_tokens
    response = litellm.completion(
        **options,
        messages=messages,
        response_format={"type": "json_object"},
        timeout=timeout,
        num_retries=0,
    )
    result = json.loads(response.choices[0].message.content)
    if not isinstance(result, dict):
        raise ValueError("The model did not return a JSON object")
    return result
