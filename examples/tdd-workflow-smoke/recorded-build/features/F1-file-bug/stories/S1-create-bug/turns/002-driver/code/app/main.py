"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="bug-tracker-ff-20260608-235044", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/bugs/create", response_class=HTMLResponse)
def create_bug_form():
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>File a Bug</title>
  <style>
    body {
      font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
      background-color: #F9F7F4;
      color: #1B3139;
      margin: 0;
      padding: 0;
    }
    nav {
      background-color: #1B3139;
      height: 64px;
      border-bottom: 2px solid #FF3621;
      display: flex;
      align-items: center;
      padding: 0 32px;
    }
    nav a { color: #FFFFFF; text-decoration: none; font-size: 16px; }
    main {
      max-width: 960px;
      margin: 32px auto;
      padding: 0 16px;
    }
    h1 { font-size: 29px; line-height: 1.25; margin-bottom: 24px; }
    .card {
      background: #FFFFFF;
      border: 1px solid #CCCEDB;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(27,49,57,0.12);
      padding: 20px;
    }
    .field { margin-bottom: 16px; }
    label {
      display: block;
      font-size: 16px;
      color: #1B3139;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    input[type="text"], textarea {
      width: 100%;
      box-sizing: border-box;
      background: #FFFFFF;
      border: 1px solid #B2B9C2;
      border-radius: 4px;
      color: #1B3139;
      font-size: 15px;
      padding: 12px;
      font-family: inherit;
    }
    input[type="text"]:focus, textarea:focus {
      outline: 2px solid #0176D3;
    }
    button[type="submit"] {
      background: #FF3621;
      color: #FFFFFF;
      border: none;
      border-radius: 0;
      font-size: 16px;
      padding: 12px 24px;
      cursor: pointer;
    }
    button[type="submit"]:hover { background: #EB1600; }
  </style>
</head>
<body>
  <nav><a href="/">Bug Tracker</a></nav>
  <main>
    <h1>File a Bug</h1>
    <div class="card">
      <form method="POST" action="/bugs">
        <div class="field">
          <label for="title">TITLE</label>
          <input type="text" id="title" name="title" required />
        </div>
        <div class="field">
          <label for="description">DESCRIPTION</label>
          <textarea id="description" name="description" rows="5" required></textarea>
        </div>
        <button type="submit">Submit</button>
      </form>
    </div>
  </main>
</body>
</html>"""
