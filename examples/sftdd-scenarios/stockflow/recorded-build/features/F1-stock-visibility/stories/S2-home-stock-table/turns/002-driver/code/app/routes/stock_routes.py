"""Boundary layer -- HTTP handlers for stock receive flow.

Delegates validation + persistence to the service layer (layering contract T8).
"""

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from app.services.dependencies import get_stock_service
from app.services.stock_service import StockService

router = APIRouter()
templates = Jinja2Templates(directory="templates")


@router.get("/")
def home(request: Request, svc: StockService = Depends(get_stock_service)):
    stocks = svc.list_all()
    return templates.TemplateResponse(
        request,
        "home.html",
        {"stocks": stocks},
    )


@router.get("/receive")
def receive_form(request: Request):
    return templates.TemplateResponse(
        request,
        "receive.html",
        {
            "error_sku": None,
            "error_location": None,
            "error_qty": None,
            "sku": "",
            "location": "",
            "qty": "",
            "tracking_code": "",
        },
    )


@router.post("/receive")
def receive_submit(
    request: Request,
    sku: str = Form(default=""),
    location: str = Form(default=""),
    qty: str = Form(default=""),
    tracking_code: str = Form(default=""),
    svc: StockService = Depends(get_stock_service),
):
    err = svc.validate(sku, location, qty)
    if err.has_errors:
        return templates.TemplateResponse(
            request,
            "receive.html",
            {
                "error_sku": err.sku,
                "error_location": err.location,
                "error_qty": err.qty,
                "sku": sku,
                "location": location,
                "qty": qty,
                "tracking_code": tracking_code,
            },
            status_code=422,
        )
    svc.record(sku, location, qty, tracking_code)
    return RedirectResponse(
        url=f"/receive/confirm?sku={sku}&location={location}&qty={qty}",
        status_code=303,
    )


@router.get("/receive/confirm")
def receive_confirm(request: Request, sku: str = "", location: str = "", qty: str = ""):
    return templates.TemplateResponse(
        request,
        "receive_confirm.html",
        {
            "sku": sku,
            "location": location,
            "qty": qty,
        },
    )
