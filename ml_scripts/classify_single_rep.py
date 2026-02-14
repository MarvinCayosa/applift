#!/usr/bin/env python3
"""
Single Rep Classification Script

Takes a model path and feature JSON as arguments, outputs classification result.

Usage:
    python classify_single_rep.py <model_path> <features_json>

Output (JSON):
    {
        "prediction": 0,
        "confidence": 0.85,
        "probabilities": [0.85, 0.10, 0.05]
    }
"""

import sys
import json
import traceback


def load_model(model_path):
    """Load a trained model from pkl file."""
    try:
        import joblib
        model_package = joblib.load(model_path)
        return model_package
    except Exception as e:
        return None


def extract_feature_vector(features_dict, feature_names):
    """Extract feature vector in correct order for the model."""
    feature_vector = []
    for name in feature_names:
        value = features_dict.get(name, 0)
        if value is None or (isinstance(value, float) and (value != value)):  # NaN check
            value = 0
        feature_vector.append(value)
    return feature_vector


def classify(model_package, features_dict):
    """Classify a single rep using the model."""
    import numpy as np
    
    # Extract components from model package
    if isinstance(model_package, dict):
        model = model_package.get('model')
        scaler = model_package.get('scaler')
        feature_names = model_package.get('feature_names', [])
    else:
        # Legacy format - just the model
        model = model_package
        scaler = None
        feature_names = list(features_dict.keys())
    
    if model is None:
        raise ValueError("No model found in package")
    
    # Build feature vector
    feature_vector = extract_feature_vector(features_dict, feature_names)
    X = np.array([feature_vector])
    
    # Scale if scaler available
    if scaler is not None:
        X = scaler.transform(X)
    
    # Predict
    prediction = int(model.predict(X)[0])
    
    # Get probabilities if available
    probabilities = None
    confidence = 0.8
    
    if hasattr(model, 'predict_proba'):
        try:
            proba = model.predict_proba(X)[0]
            probabilities = proba.tolist()
            confidence = float(max(proba))
        except Exception:
            pass
    
    return {
        "prediction": prediction,
        "confidence": round(confidence, 4),
        "probabilities": probabilities
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "Usage: classify_single_rep.py <model_path> <features_json>",
            "prediction": 0,
            "confidence": 0.5
        }))
        sys.exit(1)
    
    model_path = sys.argv[1]
    features_json = sys.argv[2]
    
    try:
        # Parse features
        features = json.loads(features_json)
        
        # Load model
        model_package = load_model(model_path)
        
        if model_package is None:
            print(json.dumps({
                "error": f"Could not load model from {model_path}",
                "prediction": 0,
                "confidence": 0.5
            }))
            sys.exit(1)
        
        # Classify
        result = classify(model_package, features)
        print(json.dumps(result))
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            "error": f"Invalid JSON: {str(e)}",
            "prediction": 0,
            "confidence": 0.5
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc(),
            "prediction": 0,
            "confidence": 0.5
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
