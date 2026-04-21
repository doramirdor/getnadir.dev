"""
Demonstration: how multi-turn conversations are sent to the backend and how
context truncation behaves.

Run:
    python3 backend/scripts/demo_multi_turn.py
"""
import importlib.util
import json
import sys
from pathlib import Path

# Load context_truncation directly to avoid importing the full app package
_truncation_path = (
    Path(__file__).resolve().parents[1] / "app" / "services" / "context_truncation.py"
)
_spec = importlib.util.spec_from_file_location("context_truncation", _truncation_path)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["context_truncation"] = _mod
_spec.loader.exec_module(_mod)
truncate_middle_out = _mod.truncate_middle_out


def build_conversation(num_turns: int, filler_chars: int = 0) -> list[dict]:
    """Build a synthetic alternating user/assistant conversation."""
    msgs = [{"role": "system", "content": "You are a helpful assistant."}]
    for i in range(num_turns):
        user_content = f"User turn {i+1}: What is {i+1} + {i+1}?"
        if filler_chars:
            user_content += " " + ("x" * filler_chars)
        asst_content = f"Assistant turn {i+1}: The answer is {2*(i+1)}."
        msgs.append({"role": "user", "content": user_content})
        msgs.append({"role": "assistant", "content": asst_content})
    return msgs


def print_section(title: str) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


def main() -> None:
    print_section("1. THE REQUEST IS A JSON PAYLOAD (OpenAI format)")
    small_convo = build_conversation(num_turns=2)
    request_body = {
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "messages": small_convo,
    }
    print("POST /chat/completions  Content-Type: application/json")
    print(json.dumps(request_body, indent=2))
    print(f"\n -> {len(small_convo)} messages in the array. "
          "The client sends ALL of them on every turn.")

    print_section("2. 10-TURN CONVERSATION — FITS IN CONTEXT")
    convo_10 = build_conversation(num_turns=10)  # 1 system + 20 chat = 21 msgs
    print(f"Total messages in payload: {len(convo_10)}")
    print(f"Roles: {[m['role'] for m in convo_10]}")

    result = truncate_middle_out(convo_10, model="gpt-4o-mini")
    print(f"\nAfter truncate_middle_out: {len(result)} messages "
          f"({'UNCHANGED' if result is convo_10 or len(result) == len(convo_10) else 'truncated'})")
    print("=> The model sees the ENTIRE history (all 21 messages).")

    print_section("3. 10-TURN CONVERSATION — DOES NOT FIT (forced truncation)")
    # Big filler + tiny pretend context window via hint
    big_convo = build_conversation(num_turns=10, filler_chars=2000)
    print(f"Input messages: {len(big_convo)}")
    total_chars = sum(len(m["content"]) for m in big_convo)
    print(f"Total chars: {total_chars:,}  (~{total_chars // 4:,} tokens fallback)")

    # Force a tiny context window so truncation kicks in
    truncated = truncate_middle_out(
        big_convo,
        model="fake-model-not-in-litellm",
        context_window_hint="4k",
    )
    print(f"\nAfter truncate_middle_out (context_window_hint='4k'): "
          f"{len(truncated)} messages")
    print("\nSurviving messages (role + first 60 chars):")
    for i, m in enumerate(truncated):
        preview = m["content"][:60].replace("\n", " ")
        print(f"  [{i}] {m['role']:9s} | {preview}")

    print_section("4. RECAP MESSAGE INJECTED FOR DROPPED TURNS")
    recap = next(
        (m for m in truncated
         if m["role"] == "system" and m["content"].startswith("[Context recap")),
        None,
    )
    if recap:
        print("A synthetic system message was inserted so the model still sees")
        print("what earlier turns were about:\n")
        print(recap["content"])
    else:
        print("No recap was generated (nothing was dropped).")

    print_section("SUMMARY")
    print("- Payload format: JSON body with a 'messages' array (OpenAI schema).")
    print("- Client is responsible for replaying the full history each turn.")
    print("- If it fits the context window: the model sees EVERY prior turn.")
    print("- If it doesn't fit: middle-out truncation keeps system + first")
    print("  user message + last 2 messages, and injects a deterministic recap")
    print("  system message summarizing the dropped middle turns.")


if __name__ == "__main__":
    main()
