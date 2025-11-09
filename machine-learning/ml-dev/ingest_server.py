from flask import Flask, request, jsonify
app = Flask(__name__)
@app.post("/ingest")
def ingest():
    print(request.json, flush=True)
    return jsonify(ok=True)
if __name__ == "__main__":
    app.run(port=8000)
