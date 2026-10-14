"""Versioned extraction contract; evidence is support, never semantic proof."""

import re
import unicodedata
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Text = Annotated[str, Field(min_length=1, max_length=1000)]
Money = Annotated[int, Field(ge=0, le=1_000_000_000)]
Quantity = Annotated[int, Field(ge=1, le=10000)]
DIGITS = str.maketrans("၀၁၂၃၄၅၆၇၈၉", "0123456789")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Customer(Strict):
    name: Text | None
    phone: Annotated[str, Field(min_length=1, max_length=40)] | None
    township: Text | None
    address: Text | None


class Item(Strict):
    product_name: Text | None
    qty: Quantity | None
    unit_price: Money | None


class Draft(Strict):
    customer: Customer
    items: Annotated[list[Item], Field(max_length=20)]
    delivery_fee: Money | None
    note: Text | None


class Evidence(Strict):
    field: Annotated[str, Field(min_length=1, max_length=100)]
    quote: Annotated[str, Field(min_length=1, max_length=5000)]


class Extraction(Strict):
    schema_version: Literal["1.0"]
    draft: Draft
    evidence: Annotated[list[Evidence], Field(max_length=70)]


def flatten(draft: dict) -> dict:
    fields = {f"customer.{k}": v for k, v in draft["customer"].items()}
    for i, item in enumerate(draft["items"]):
        fields.update({f"items.{i}.{k}": v for k, v in item.items()})
    return {**fields, "delivery_fee": draft["delivery_fee"], "note": draft["note"]}


def check_evidence(extraction: Extraction, text: str) -> list[str]:
    fields = flatten(extraction.draft.model_dump())
    seen, errors = set(), []
    for evidence in extraction.evidence:
        if evidence.field in seen:
            errors.append(f"duplicate evidence: {evidence.field}")
        seen.add(evidence.field)
        if evidence.field not in fields or fields[evidence.field] is None:
            errors.append(f"evidence for absent field: {evidence.field}")
        if evidence.quote not in text:
            errors.append(f"quotation absent from original: {evidence.field}")
    errors.extend(
        f"missing evidence: {k}"
        for k, v in fields.items()
        if v is not None and k not in seen
    )
    return errors


def normalize(value, field=""):
    if not isinstance(value, str):
        return value
    value = unicodedata.normalize("NFC", value).translate(DIGITS).casefold()
    if field.endswith("phone"):
        return re.sub(r"[\s().-]", "", value)
    # Ignore punctuation/spacing only. Do not transliterate, translate, drop words or digits.
    return "".join(
        c
        for c in value
        if not c.isspace() and not unicodedata.category(c).startswith("P")
    )


def totals(draft: dict) -> dict:
    lines = [
        (
            i["qty"] * i["unit_price"]
            if i["qty"] is not None and i["unit_price"] is not None
            else None
        )
        for i in draft["items"]
    ]
    subtotal = sum(lines) if lines and all(v is not None for v in lines) else None
    total = (
        subtotal + draft["delivery_fee"]
        if subtotal is not None and draft["delivery_fee"] is not None
        else None
    )
    return {"line_totals": lines, "subtotal": subtotal, "total": total}
