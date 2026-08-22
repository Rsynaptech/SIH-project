from fastapi import FastAPI

app = FastAPI(title="PAIMANA Prism API")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "PAIMANA Prism API is running"}
