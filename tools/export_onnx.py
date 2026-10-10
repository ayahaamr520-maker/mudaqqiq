"""Export the two Hugging Face models to ONNX int8 for in-browser use.

Usage:  python tools/export_onnx.py [punctuation|spelling|all]
Needs:  pip install torch "transformers<5" onnx onnxruntime

  punctuation → web/models/arabic-punctuation   (makdadTaleb/arabic-punctuation-arabert, MIT)
  spelling    → web/models/arabic-spelling      (CAMeL-Lab/text-editing-qalb14-nopnx, MIT)
  context     → web/models/arabic-context       (aubmindlab/bert-base-arabertv02 masked LM; no licence stated, cite Antoun et al. 2020)
"""
import os, sys
import torch
from transformers import AutoTokenizer, BertTokenizerFast, BertForTokenClassification, BertForMaskedLM
from onnxruntime.quantization import quantize_dynamic, QuantType

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = {
    "punctuation": {
        "id": "makdadTaleb/arabic-punctuation-arabert",
        "out": os.path.join(HERE, "..", "web", "models", "arabic-punctuation"),
        "labels": {0: "O", 1: ".", 2: "،", 3: "؟", 4: "!", 5: "؛", 6: ":"},
    },
    "spelling": {
        "id": "CAMeL-Lab/text-editing-qalb14-nopnx",
        "out": os.path.join(HERE, "..", "web", "models", "arabic-spelling"),
        "labels": None,  # keep the model's own edit tags
    },
    "context": {
        "id": "aubmindlab/bert-base-arabertv02",
        "out": os.path.join(HERE, "..", "web", "models", "arabic-context"),
        "labels": None,
        "mlm": True,
    },
}


class GatherMLM(torch.nn.Module):
    """BERT masked LM → log-probabilities at `positions` only ([batch, k, vocab])."""

    def __init__(self, mlm):
        super().__init__()
        self.mlm = mlm

    def forward(self, input_ids, attention_mask, token_type_ids, positions):
        h = self.mlm.bert(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids).last_hidden_state
        g = torch.gather(h, 1, positions.unsqueeze(-1).expand(-1, -1, h.size(-1)))
        return torch.log_softmax(self.mlm.cls(g), dim=-1)


def export(name):
    spec = MODELS[name]
    out = spec["out"]
    os.makedirs(os.path.join(out, "onnx"), exist_ok=True)
    # The fast tokenizer writes tokenizer.json, which transformers.js needs.
    tok = BertTokenizerFast.from_pretrained(spec["id"]) if name == "spelling" else AutoTokenizer.from_pretrained(spec["id"])
    cls = BertForMaskedLM if spec.get("mlm") else BertForTokenClassification
    model = cls.from_pretrained(spec["id"]).eval()
    tok.save_pretrained(out)
    if spec["labels"]:
        model.config.id2label = spec["labels"]
        model.config.label2id = {v: k for k, v in spec["labels"].items()}
    model.config.architectures = ["BertForMaskedLM" if spec.get("mlm") else "BertForTokenClassification"]
    model.config.save_pretrained(out)

    enc = tok(["كيف حالك"], return_tensors="pt")
    fp32 = os.path.join(out, "onnx", "model_fp32.onnx")
    if spec.get("mlm"):
        # Masked LM that returns log-probabilities only at the requested
        # positions: much faster in the browser than scoring every token
        # against the 64,000-word vocabulary.
        positions = torch.tensor([[1]])
        torch.onnx.export(
            GatherMLM(model),
            (enc["input_ids"], enc["attention_mask"], enc["token_type_ids"], positions),
            fp32,
            input_names=["input_ids", "attention_mask", "token_type_ids", "positions"],
            output_names=["logits"],
            dynamic_axes={"input_ids": {0: "batch", 1: "seq"}, "attention_mask": {0: "batch", 1: "seq"},
                          "token_type_ids": {0: "batch", 1: "seq"}, "positions": {0: "batch", 1: "k"}, "logits": {0: "batch", 1: "k"}},
            opset_version=17,
            dynamo=False,
        )
    else:
        torch.onnx.export(
            model,
            (enc["input_ids"], enc["attention_mask"], enc["token_type_ids"]),
            fp32,
            input_names=["input_ids", "attention_mask", "token_type_ids"],
            output_names=["logits"],
            dynamic_axes={n: {0: "batch", 1: "seq"} for n in ["input_ids", "attention_mask", "token_type_ids", "logits"]},
            opset_version=17,
            dynamo=False,
        )
    q8 = os.path.join(out, "onnx", "model_quantized.onnx")
    quantize_dynamic(fp32, q8, weight_type=QuantType.QUInt8, op_types_to_quantize=["MatMul", "Gather"])
    os.remove(fp32)  # 540 MB — not needed in the browser
    print(name, "->", q8, round(os.path.getsize(q8) / 1e6, 1), "MB")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    for n in (MODELS if which == "all" else [which]):
        export(n)
