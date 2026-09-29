"""
The agent loop.

1. Retrieve relevant documentation for the question
2. Send question + documentation + tool menu to the model
3. If the model asks for a tool, run it and send the result back
4. Repeat until it answers in words
"""

import json
from groq import Groq

import config
from ai import tools as tool_module
from ai import knowledge

_client = Groq(api_key=config.GROQ_API_KEY)

MAX_TOOL_ROUNDS = 6


SYSTEM_PROMPT = """You are the PolarLog assistant. PolarLog manages logistics for \\
India's polar and high-altitude research stations: Bharati and Maitri in \\
Antarctica, Himadri in the Arctic, and Himansh in the Himalaya.

You help station officers and coordinators with inventory, alerts, shipments \\
and personnel.

How to answer:
- For anything about current quantities, alerts, shipments or people, CALL A \\
TOOL. Never guess a number.
- For questions about procedure or policy, use the documentation provided \\
below if there is any.
- If a tool returns no rows, say so plainly. Do not invent data.
- Call at most two tools. Once you have data, ANSWER. Do not keep calling \
tools hoping for something better.
- Never call the same tool twice with the same arguments.
- Documentation tells you the PROCEDURE. Only a tool tells you the CURRENT \
NUMBERS. If a question names a station or asks about current state, you MUST \
call a tool as well as using the documentation.
- Never write "if the quantity is..." or "depending on the level" when you \
could call a tool and find out. Look it up, then answer.
- If neither the tools nor the documentation cover the question, say you \\
don't have that information.
- Be brief. These are working people, not readers. Lead with the number or \\
the answer.
- Include units (litres, kg, units) and name the station.

You are read-only. You cannot create, change or delete anything. If asked to, \\
explain that the person should use the relevant page in PolarLog."""


def _run_tool(name, arguments, force_station=None):
    """Execute one tool call. Never raises - errors come back as text."""
    fn = tool_module.AVAILABLE.get(name)
    if fn is None:
        return {"error": f"No such tool: {name}"}

    # A station-scoped user can only ever see their own station.
    # Enforced HERE, in code - not in the prompt, which a model may ignore.
    # get_stations has no station parameter, so it is left alone.
    if force_station and name != "get_stations":
        arguments = dict(arguments)
        arguments["station"] = force_station

    try:
        return fn(**arguments)
    except TypeError as e:
        return {"error": f"Wrong arguments for {name}: {e}"}
    except Exception as e:
        print(f"[agent] Tool {name} failed: {e}")
        return {"error": "That query failed."}


def ask(question, user=None):
    """
    Answer a question.
    Returns {"answer": str, "tools_used": [str], "sources": [str]}
    """
    context = knowledge.as_context(question)
    sources = [h["source"] for h in knowledge.search(question)]
        # Who is allowed to see what. Admins see everything; everyone else
    # is locked to their own station.
    force_station = None
    if user and user.get("role") != "admin" and user.get("station"):
        force_station = user["station"]

    system = SYSTEM_PROMPT
    if context:
        system += (
            "\\n\\n--- PolarLog documentation relevant to this question ---\\n"
            + context
        )

    if user:
        system += (
            f"\\n\\nYou are speaking to {user.get('username')}, "
            f"whose role is {user.get('role')}."
        )

    if force_station:
        system += (
            f"\\n\\nThis user can only see data for {force_station}. "
            f"Any tool you call returns {force_station} data only, whatever "
            f"station you ask for. If they ask about another station, tell "
            f"them plainly that their account is scoped to {force_station}."
        )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": question},
    ]

    tools_used = []

    for _ in range(MAX_TOOL_ROUNDS):
        response = _client.chat.completions.create(
            model=config.GROQ_MODEL,
            messages=messages,
            tools=tool_module.TOOL_SCHEMAS,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=700,
        )

        message = response.choices[0].message

        # No tool requested - this is the final answer
        if not message.tool_calls:
            return {
                "answer": message.content or "I couldn't produce an answer.",
                "tools_used": tools_used,
                "sources": sources,
            }

        # Record the model's request, then answer each call
        messages.append({
            "role": "assistant",
            "content": message.content,
            "tool_calls": [
                {
                    "id": c.id,
                    "type": "function",
                    "function": {
                        "name": c.function.name,
                        "arguments": c.function.arguments,
                    },
                }
                for c in message.tool_calls
            ],
        })

        for call in message.tool_calls:
            name = call.function.name
            try:
                args = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            print(f"[agent] Tool: {name}({args})")
            tools_used.append(name)

            result = _run_tool(name, args, force_station=force_station)

            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "name": name,
                "content": json.dumps(result, default=str),
            })

    return {
        "answer": "That took too many steps. Could you ask something more specific?",
        "tools_used": tools_used,
        "sources": sources,
    }