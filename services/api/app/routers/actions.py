from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.actions import (
    approve_action,
    execute_action,
    list_incident_actions,
    list_tools,
    propose_action,
    reject_action,
)
from app.database import get_db
from app.schemas import (
    ActionApprovalRequest,
    ActionListResponse,
    ActionRead,
    ActionRejectRequest,
    ToolListResponse,
)


router = APIRouter(tags=["actions"])


@router.get("/tools", response_model=ToolListResponse)
async def get_tools() -> ToolListResponse:
    return ToolListResponse(tools=list_tools())


@router.get("/incidents/{incident_id}/actions", response_model=ActionListResponse)
async def get_incident_actions(incident_id: str, db: Session = Depends(get_db)) -> ActionListResponse:
    return ActionListResponse(actions=list_incident_actions(db, incident_id))


@router.post("/incidents/{incident_id}/actions/propose", response_model=ActionRead)
async def propose_incident_action(incident_id: str, db: Session = Depends(get_db)) -> ActionRead:
    try:
        return propose_action(db, incident_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/actions/{action_id}/approve", response_model=ActionRead)
async def approve_incident_action(
    action_id: str,
    request: ActionApprovalRequest,
    db: Session = Depends(get_db),
) -> ActionRead:
    try:
        return approve_action(db, action_id, approved_by=request.approved_by, note=request.note)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/actions/{action_id}/reject", response_model=ActionRead)
async def reject_incident_action(
    action_id: str,
    request: ActionRejectRequest,
    db: Session = Depends(get_db),
) -> ActionRead:
    try:
        return reject_action(db, action_id, rejected_by=request.rejected_by, note=request.note)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/actions/{action_id}/execute", response_model=ActionRead)
async def execute_incident_action(action_id: str, db: Session = Depends(get_db)) -> ActionRead:
    try:
        return execute_action(db, action_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
