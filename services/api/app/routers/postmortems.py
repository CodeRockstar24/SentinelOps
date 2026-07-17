from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import IncidentRecord
from app.postmortems import generate_postmortem, list_postmortems
from app.schemas import PostmortemListResponse, PostmortemResponse


router = APIRouter(tags=["postmortems"])


@router.get("/incidents/{incident_id}/postmortems", response_model=PostmortemListResponse)
async def get_incident_postmortems(
    incident_id: str,
    db: Session = Depends(get_db),
) -> PostmortemListResponse:
    if db.get(IncidentRecord, incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    return PostmortemListResponse(postmortems=list_postmortems(db, incident_id))


@router.post("/incidents/{incident_id}/postmortems", response_model=PostmortemResponse)
async def generate_incident_postmortem(
    incident_id: str,
    db: Session = Depends(get_db),
) -> PostmortemResponse:
    try:
        incident, postmortem = generate_postmortem(db, incident_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return PostmortemResponse(incident=incident, postmortem=postmortem)
