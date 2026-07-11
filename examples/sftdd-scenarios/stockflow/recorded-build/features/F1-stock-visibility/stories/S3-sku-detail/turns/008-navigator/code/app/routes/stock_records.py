"""Stock records API boundary (JSON only, renders_via: react).

Validates the request shape (field-named errors, NFR-F1-field-named-validation)
and delegates to the service; never touches the DB session directly
(persistence is confined to app/repositories/).
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.stock_service import list_stock_for_location, record_stock

router = APIRouter()


class StockRecordIn(BaseModel):
    sku: str = Field(min_length=1)
    location: str = Field(min_length=1)
    quantity: int = Field(ge=0, description="quantity must be >= 0")
    inventory_code: str = Field(min_length=1)


class StockRecordOut(BaseModel):
    sku: str
    location: str
    quantity: int
    inventory_code: str


@router.post("/api/stock-records", status_code=201, response_model=StockRecordOut)
def file_stock_record(payload: StockRecordIn) -> StockRecordOut:
    record = record_stock(
        sku=payload.sku,
        location=payload.location,
        quantity=payload.quantity,
        inventory_code=payload.inventory_code,
    )
    return StockRecordOut(
        sku=record.sku,
        location=record.location,
        quantity=record.quantity,
        inventory_code=record.inventory_code,
    )


@router.get("/api/stock-records", response_model=list[StockRecordOut])
def list_stock_records(location: str = Query(min_length=1)) -> list[StockRecordOut]:
    records = list_stock_for_location(location)
    return [
        StockRecordOut(
            sku=record.sku,
            location=record.location,
            quantity=record.quantity,
            inventory_code=record.inventory_code,
        )
        for record in records
    ]
