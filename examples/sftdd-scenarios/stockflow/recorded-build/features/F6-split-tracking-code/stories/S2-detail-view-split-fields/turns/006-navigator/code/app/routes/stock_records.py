"""Stock records API boundary (JSON only, renders_via: react).

Validates the request shape (field-named errors, NFR-F1-field-named-validation)
and delegates to the service; never touches the DB session directly
(persistence is confined to app/repositories/).
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.stock_service import get_sku_detail, list_stock_for_location, record_stock

router = APIRouter()


class StockRecordIn(BaseModel):
    sku: str = Field(min_length=1)
    location: str = Field(min_length=1)
    quantity: int = Field(ge=0, description="quantity must be >= 0")
    batch_number: str | None = None
    serial_number: str | None = None


class StockRecordOut(BaseModel):
    sku: str
    location: str
    quantity: int
    batch_number: str | None = None
    serial_number: str | None = None


@router.post("/api/stock-records", status_code=201, response_model=StockRecordOut)
def file_stock_record(payload: StockRecordIn) -> StockRecordOut:
    record = record_stock(
        sku=payload.sku,
        location=payload.location,
        quantity=payload.quantity,
        batch_number=payload.batch_number,
        serial_number=payload.serial_number,
    )
    return StockRecordOut(
        sku=record.sku,
        location=record.location,
        quantity=record.quantity,
        batch_number=record.batch_number,
        serial_number=record.serial_number,
    )


@router.get("/api/stock-records", response_model=list[StockRecordOut])
def list_stock_records(location: str = Query(min_length=1)) -> list[StockRecordOut]:
    records = list_stock_for_location(location)
    return [
        StockRecordOut(
            sku=record.sku,
            location=record.location,
            quantity=record.quantity,
            batch_number=record.batch_number,
            serial_number=record.serial_number,
        )
        for record in records
    ]


class SkuDetailEntry(BaseModel):
    location: str
    quantity: int
    batch_number: str | None = None
    serial_number: str | None = None


class SkuDetailOut(BaseModel):
    entries: list[SkuDetailEntry]
    par_level: int | None = None


@router.get("/api/stock-records/{sku}/detail", response_model=SkuDetailOut)
def get_sku_detail_view(sku: str) -> SkuDetailOut:
    records = get_sku_detail(sku)
    return SkuDetailOut(
        entries=[
            SkuDetailEntry(
                location=record.location,
                quantity=record.quantity,
                batch_number=record.batch_number,
                serial_number=record.serial_number,
            )
            for record in records
        ],
        par_level=None,
    )
