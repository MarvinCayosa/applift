#!/usr/bin/env python3
"""
ML Classification API for Cloud Run
FastAPI service for workout exercise classification
"""

import os
import json
import logging
from typing import Dict, List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Lifespan handler (replaces deprecated @app.on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload common models on startup."""
    logger.info("Starting ML Classification API...")
    common_exercises = ["CONCENTRATION_CURLS", "LATERAL_PULLDOWN", "OVERHEAD_EXTENSIONS"]
    for exercise in common_exercises:
        try:
            load_model_if_needed(exercise)
            logger.info(f"Preloaded model: {exercise}")
        except Exception as e:
            logger.warning(f"Failed to preload {exercise}: {str(e)}")
    yield
    logger.info("Shutting down ML Classification API...")


app = FastAPI(
    title="Workout Classification API",
    description="ML-powered exercise classification service",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class ClassificationRequest(BaseModel):
    exercise_type: str  # e.g., "CONCENTRATION_CURLS", "LATERAL_PULLDOWN"
    features: Dict[str, float]
    
class ClassificationResponse(BaseModel):
    prediction: int
    class_name: str
    confidence: float
    probabilities: List[float]
    exercise_type: str
    model_used: str

# Global model cache
MODEL_CACHE = {}
# Use path relative to this script's location, not the cwd
MODELS_DIR = Path(__file__).parent / "models"

def load_model_if_needed(exercise_type: str):
    """Load model into cache if not already loaded."""
    if exercise_type not in MODEL_CACHE:
        model_path = MODELS_DIR / f"{exercise_type}_RF.pkl"
        
        if not model_path.exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Model not found for exercise: {exercise_type}"
            )
        
        try:
            logger.info(f"Loading model: {model_path}")
            model_package = joblib.load(model_path)
            MODEL_CACHE[exercise_type] = model_package
            logger.info(f"Model loaded successfully: {exercise_type}")
        except Exception as e:
            logger.error(f"Failed to load model {exercise_type}: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to load model: {str(e)}"
            )
    
    return MODEL_CACHE[exercise_type]

def extract_feature_vector(features_dict: Dict[str, float], feature_names: List[str]) -> List[float]:
    """Extract feature vector in correct order for the model."""
    feature_vector = []
    for name in feature_names:
        value = features_dict.get(name, 0)
        # Handle NaN and None values
        if value is None or (isinstance(value, float) and np.isnan(value)):
            value = 0
        feature_vector.append(float(value))
    return feature_vector

def classify_exercise(model_package, features_dict: Dict[str, float]) -> Dict:
    """Classify a single rep using the model."""
    try:
        # Extract components from model package
        if isinstance(model_package, dict):
            model = model_package.get('model')
            feature_names = model_package.get('feature_names', [])
            scaler = model_package.get('scaler')  # Support scaler from original pipeline
            label_encoder = model_package.get('label_encoder')
        else:
            # Fallback if model is directly the classifier
            model = model_package
            feature_names = list(features_dict.keys())
            scaler = None
            label_encoder = None
        
        if model is None:
            raise ValueError("Model not found in package")
        
        # Prepare feature vector
        feature_vector = extract_feature_vector(features_dict, feature_names)
        feature_array = np.array([feature_vector])
        
        # Apply scaler if available (matches classify_single_rep.py logic)
        if scaler is not None:
            feature_array = scaler.transform(feature_array)
        
        # Get prediction
        prediction = model.predict(feature_array)[0]
        
        # Get probabilities if available
        probabilities = []
        confidence = 0.8  # default fallback
        if hasattr(model, 'predict_proba'):
            try:
                probabilities = model.predict_proba(feature_array)[0].tolist()
                confidence = float(max(probabilities))
            except Exception:
                probabilities = []
        
        # Convert prediction if label encoder exists
        if label_encoder:
            prediction_label = label_encoder.inverse_transform([prediction])[0]
        else:
            prediction_label = int(prediction)
        
        # Get human-readable class name
        class_names = None
        if isinstance(model_package, dict):
            class_names = model_package.get('class_names')
        class_name = "Unknown"
        if class_names and prediction_label in class_names:
            class_name = class_names[prediction_label]
        elif class_names and int(prediction_label) in class_names:
            class_name = class_names[int(prediction_label)]

        return {
            "prediction": prediction_label,
            "class_name": class_name,
            "confidence": round(confidence, 4),
            "probabilities": probabilities
        }
        
    except Exception as e:
        logger.error(f"Classification error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")

@app.get("/")
async def health_check():
    """Health check endpoint."""
    model_files = [f.name for f in MODELS_DIR.glob("*.pkl")] if MODELS_DIR.exists() else []
    return {
        "status": "healthy",
        "service": "ML Classification API",
        "available_models": model_files
    }

@app.get("/models")
async def list_models():
    """List available models."""
    models = []
    for model_file in MODELS_DIR.glob("*.pkl"):
        exercise_type = model_file.stem.replace("_RF", "")
        models.append({
            "exercise_type": exercise_type,
            "model_file": model_file.name,
            "loaded": exercise_type in MODEL_CACHE
        })
    return {"models": models}

@app.post("/classify", response_model=ClassificationResponse)
async def classify(request: ClassificationRequest):
    """Classify exercise form based on features."""
    try:
        # Load model
        model_package = load_model_if_needed(request.exercise_type)
        
        # Perform classification
        result = classify_exercise(model_package, request.features)
        
        # Return response
        return ClassificationResponse(
            prediction=result["prediction"],
            class_name=result["class_name"],
            confidence=result["confidence"],
            probabilities=result["probabilities"],
            exercise_type=request.exercise_type,
            model_used=f"{request.exercise_type}_RF.pkl"
        )
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions (404, etc.) as-is
    except Exception as e:
        logger.error(f"Classification endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def to_json_safe(obj):
    """Convert numpy/non-serializable types to JSON-safe Python types."""
    if isinstance(obj, dict):
        return {str(k): to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_json_safe(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj

@app.get("/model-info/{exercise_type}")
async def model_info(exercise_type: str):
    """Get detailed model metadata."""
    model_package = load_model_if_needed(exercise_type)
    if not isinstance(model_package, dict):
        return {"exercise_type": exercise_type, "info": "raw model (no metadata)"}
    
    return to_json_safe({
        "exercise_type": exercise_type,
        "class_names": model_package.get("class_names"),
        "exercise_types": model_package.get("exercise_types"),
        "equipment_types": model_package.get("equipment_types"),
        "exercise_code": model_package.get("exercise_code"),
        "model_type": model_package.get("model_type"),
        "training_date": model_package.get("training_date"),
        "feature_count": len(model_package.get("feature_names", [])),
        "smote_applied": model_package.get("smote_applied"),
    })

@app.post("/batch-classify")
async def batch_classify(requests: List[ClassificationRequest]):
    """Classify multiple exercises at once."""
    results = []
    
    for req in requests:
        try:
            model_package = load_model_if_needed(req.exercise_type)
            result = classify_exercise(model_package, req.features)
            
            results.append(ClassificationResponse(
                prediction=result["prediction"],
                class_name=result["class_name"],
                confidence=result["confidence"],
                probabilities=result["probabilities"],
                exercise_type=req.exercise_type,
                model_used=f"{req.exercise_type}_RF.pkl"
            ))
        except Exception as e:
            logger.error(f"Batch classification error for {req.exercise_type}: {str(e)}")
            # Continue with other requests, but log the error
            results.append({
                "error": str(e),
                "exercise_type": req.exercise_type
            })
    
    return {"results": results}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)