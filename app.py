from flask import Flask, render_template, request, jsonify
import os, requests

app = Flask(__name__)

@app.route("/")
@app.route("/home")
def home():
    return render_template("home.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/meet-the-team")
def meet_the_team():
    return render_template("meet_the_team.html")

@app.route("/ai-chat")
def ai_chat():
    return render_template("ai-chat.html")

@app.route("/campaign")
def campaign():
    return render_template("campaign.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")

@app.route("/voice")
def voice():
    return render_template("voice.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/register")
def register_page():
    return render_template("register.html")

@app.route("/account")
def account_page():
    return render_template("account.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    GROQ_KEY = os.environ.get("GROQ_API_KEY")
    GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
    if not GROQ_KEY:
        return jsonify({"reply": "Server configuration error."}), 500

    data = request.get_json()
    messages = data.get("messages", [])
    user_name = data.get("userName", "there")
    has_image = data.get("hasImage", False)
    image_data = data.get("imageData")
    image_type = data.get("imageType", "image/jpeg")
    memory_context = data.get("memoryContext", [])

    memory_note = ""
    if memory_context:
        summary = "\n".join([f"{'User' if m['role']=='user' else 'You'}: {m['content']}" for m in memory_context])
        memory_note = f"\n\nContext from earlier conversations:\n{summary}"

    sys_prompt = f"""You are Nakconel AI, the brand intelligence assistant for Nakconel — a brand management and AI strategy company. You speak with clarity, confidence, and cultural respect: strategic not vague, premium not distant, intelligent not complicated, global not generic, helpful not hype-driven.

Your job is to help people build stronger brands. You specialize in Nakconel's five pillars:
1. Brand Strategy — positioning, market clarity, audience intelligence, brand architecture, naming, messaging, growth planning.
2. Content & Design — visual identity direction, campaign concepts, social content systems, editorial/storytelling, design briefs.
3. IT & Technology — websites, client portals, workflow tools, automation, digital transformation guidance.
4. AI Enablement — AI adoption roadmaps, prompt systems, AI content workflows, brand intelligence dashboards.
5. Cultural Intelligence — market-aware branding for Africa, United States, Australia, and Gulf countries.

Only use code blocks for genuine programming help, not design mockups. User's name: {user_name}.{memory_note}"""

    if has_image and image_data and GEMINI_KEY:
        last_msg = messages[-1]["content"] if messages else "What is in this image?"
        contents = []
        for m in messages[:-1]:
            if m.get("content"):
                contents.append({"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]})
        contents.append({"role": "user", "parts": [{"inline_data": {"mime_type": image_type, "data": image_data}}, {"text": last_msg}]})
        for model in ["gemini-1.5-flash-8b", "gemini-1.5-flash"]:
            try:
                r = requests.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}",
                    json={"system_instruction": {"parts": [{"text": sys_prompt}]}, "contents": contents, "generationConfig": {"maxOutputTokens": 1000, "temperature": 0.7}}
                )
                d = r.json()
                if d.get("error", {}).get("code") == 429:
                    continue
                reply = d.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
                if reply:
                    return jsonify({"reply": reply, "model": "gemini-vision"})
            except Exception:
                continue
        return jsonify({"reply": "Image analysis quota reached. Try again later."})

    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_KEY}"},
        json={"model": "llama-3.3-70b-versatile", "max_tokens": 1024, "messages": [{"role": "system", "content": sys_prompt}] + messages}
    )
    d = r.json()
    reply = d.get("choices", [{}])[0].get("message", {}).get("content", "I'm having trouble responding. Please try again.")
    return jsonify({"reply": reply, "model": "groq"})


@app.route("/api/generate-image", methods=["POST"])
def generate_image():
    POLLINATIONS_KEY = os.environ.get("POLLINATIONS_API_KEY")
    GROQ_KEY = os.environ.get("GROQ_API_KEY")
    if not POLLINATIONS_KEY:
        return jsonify({"error": "Image generation is not configured."})

    data = request.get_json()
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "Missing prompt"}), 400

    final_prompt = prompt
    if GROQ_KEY:
        try:
            r = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_KEY}"},
                json={"model": "llama-3.3-70b-versatile", "max_tokens": 120, "temperature": 0.8,
                      "messages": [
                          {"role": "system", "content": "You write vivid, detailed text-to-image prompts in 2-3 sentences max. Output ONLY the prompt text, nothing else. Keep it under 60 words."},
                          {"role": "user", "content": prompt}
                      ]}
            )
            expanded = r.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if expanded:
                final_prompt = expanded[:600]
        except Exception:
            pass

    try:
        r = requests.post(
            "https://gen.pollinations.ai/v1/images/generations",
            headers={"Authorization": f"Bearer {POLLINATIONS_KEY}", "Content-Type": "application/json"},
            json={"model": "flux", "prompt": final_prompt, "n": 1, "size": "1024x1024", "response_format": "b64_json"}
        )
        item = r.json().get("data", [{}])[0]
        if item.get("b64_json"):
            return jsonify({"image": f"data:image/jpeg;base64,{item['b64_json']}", "promptUsed": final_prompt})
        return jsonify({"error": "No image returned — please try again."})
    except Exception as e:
        return jsonify({"error": "Connection error. Please try again."})


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
