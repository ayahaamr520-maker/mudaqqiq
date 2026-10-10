"""Upload both ONNX models to your own Hugging Face account so the public site
(GitHub Pages, which can't host files over 100 MB) can load them.

    pip install huggingface_hub
    huggingface-cli login                     # paste a WRITE token from huggingface.co/settings/tokens
    python tools/upload_to_hf.py YOUR-HF-USERNAME

Creates two public model repos:
    YOUR-HF-USERNAME/arabic-punctuation-arabert-onnx
    YOUR-HF-USERNAME/arabic-spelling-camel-onnx
Then run:  node tools/configure-public.mjs --hf YOUR-HF-USERNAME --site https://…
Both original models are MIT-licensed; the model cards below keep the credit.
"""
import os, sys
from huggingface_hub import HfApi

user = sys.argv[1].strip("/")
here = os.path.dirname(os.path.abspath(__file__))
MODELS = {
    "arabic-punctuation-arabert-onnx": ("arabic-punctuation", "makdadTaleb/arabic-punctuation-arabert",
                                         "Arabic punctuation restoration. Labels: none . ، ؟ ! ؛ :"),
    "arabic-spelling-camel-onnx": ("arabic-spelling", "CAMeL-Lab/text-editing-qalb14-nopnx",
                                    "Arabic spelling/grammar correction (SWEET text-editing tags, QALB-2014)."),
}
api = HfApi()
for repo_name, (folder, base, what) in MODELS.items():
    path = os.path.join(here, "..", "web", "models", folder)
    if not os.path.exists(os.path.join(path, "onnx", "model_quantized.onnx")):
        sys.exit(f"missing {path} — run tools/export_onnx.py first")
    with open(os.path.join(path, "README.md"), "w", encoding="utf-8") as f:
        f.write(f"""---
license: mit
language: [ar]
library_name: transformers.js
base_model: {base}
pipeline_tag: token-classification
---
ONNX (int8) export of [{base}](https://huggingface.co/{base}) for in-browser use with
transformers.js, made for the Mudaqqiq Arabic writing-assistant prototype. {what}
All credit for the model goes to its original authors (MIT licence).
""")
    repo = f"{user}/{repo_name}"
    api.create_repo(repo, exist_ok=True)
    api.upload_folder(repo_id=repo, folder_path=path, ignore_patterns=["onnx/model_fp32.onnx"])
    print("uploaded ->", f"https://huggingface.co/{repo}")
