"""Test the ML API locally with realistic feature values."""
import json
import urllib.request
import random

BASE_URL = "http://localhost:8080"

# All 201 features that the models expect
FEATURE_NAMES = [
    'rep_duration_ms', 'sample_count', 'avg_sample_rate',
    'filteredMag_mean', 'filteredMag_std', 'filteredMag_min', 'filteredMag_max',
    'filteredMag_range', 'filteredMag_median', 'filteredMag_p25', 'filteredMag_p75',
    'filteredMag_iqr', 'filteredMag_skew', 'filteredMag_kurtosis', 'filteredMag_energy',
    'filteredMag_rms', 'filteredMag_diff_mean', 'filteredMag_diff_std', 'filteredMag_diff_max',
    'filteredMag_peak_position', 'filteredMag_peak_value',
    'filteredX_mean', 'filteredX_std', 'filteredX_min', 'filteredX_max',
    'filteredX_range', 'filteredX_median', 'filteredX_p25', 'filteredX_p75',
    'filteredX_iqr', 'filteredX_skew', 'filteredX_kurtosis', 'filteredX_energy',
    'filteredX_rms', 'filteredX_diff_mean', 'filteredX_diff_std', 'filteredX_diff_max',
    'filteredX_peak_position', 'filteredX_peak_value',
    'filteredY_mean', 'filteredY_std', 'filteredY_min', 'filteredY_max',
    'filteredY_range', 'filteredY_median', 'filteredY_p25', 'filteredY_p75',
    'filteredY_iqr', 'filteredY_skew', 'filteredY_kurtosis', 'filteredY_energy',
    'filteredY_rms', 'filteredY_diff_mean', 'filteredY_diff_std', 'filteredY_diff_max',
    'filteredY_peak_position', 'filteredY_peak_value',
    'filteredZ_mean', 'filteredZ_std', 'filteredZ_min', 'filteredZ_max',
    'filteredZ_range', 'filteredZ_median', 'filteredZ_p25', 'filteredZ_p75',
    'filteredZ_iqr', 'filteredZ_skew', 'filteredZ_kurtosis', 'filteredZ_energy',
    'filteredZ_rms', 'filteredZ_diff_mean', 'filteredZ_diff_std', 'filteredZ_diff_max',
    'filteredZ_peak_position', 'filteredZ_peak_value',
    'accelMag_mean', 'accelMag_std', 'accelMag_min', 'accelMag_max',
    'accelMag_range', 'accelMag_median', 'accelMag_p25', 'accelMag_p75',
    'accelMag_iqr', 'accelMag_skew', 'accelMag_kurtosis', 'accelMag_energy',
    'accelMag_rms', 'accelMag_diff_mean', 'accelMag_diff_std', 'accelMag_diff_max',
    'accelMag_peak_position', 'accelMag_peak_value',
    'accelX_mean', 'accelX_std', 'accelX_min', 'accelX_max',
    'accelX_range', 'accelX_median', 'accelX_p25', 'accelX_p75',
    'accelX_iqr', 'accelX_skew', 'accelX_kurtosis', 'accelX_energy',
    'accelX_rms', 'accelX_diff_mean', 'accelX_diff_std', 'accelX_diff_max',
    'accelX_peak_position', 'accelX_peak_value',
    'accelY_mean', 'accelY_std', 'accelY_min', 'accelY_max',
    'accelY_range', 'accelY_median', 'accelY_p25', 'accelY_p75',
    'accelY_iqr', 'accelY_skew', 'accelY_kurtosis', 'accelY_energy',
    'accelY_rms', 'accelY_diff_mean', 'accelY_diff_std', 'accelY_diff_max',
    'accelY_peak_position', 'accelY_peak_value',
    'accelZ_mean', 'accelZ_std', 'accelZ_min', 'accelZ_max',
    'accelZ_range', 'accelZ_median', 'accelZ_p25', 'accelZ_p75',
    'accelZ_iqr', 'accelZ_skew', 'accelZ_kurtosis', 'accelZ_energy',
    'accelZ_rms', 'accelZ_diff_mean', 'accelZ_diff_std', 'accelZ_diff_max',
    'accelZ_peak_position', 'accelZ_peak_value',
    'gyroX_mean', 'gyroX_std', 'gyroX_min', 'gyroX_max',
    'gyroX_range', 'gyroX_median', 'gyroX_p25', 'gyroX_p75',
    'gyroX_iqr', 'gyroX_skew', 'gyroX_kurtosis', 'gyroX_energy',
    'gyroX_rms', 'gyroX_diff_mean', 'gyroX_diff_std', 'gyroX_diff_max',
    'gyroX_peak_position', 'gyroX_peak_value',
    'gyroY_mean', 'gyroY_std', 'gyroY_min', 'gyroY_max',
    'gyroY_range', 'gyroY_median', 'gyroY_p25', 'gyroY_p75',
    'gyroY_iqr', 'gyroY_skew', 'gyroY_kurtosis', 'gyroY_energy',
    'gyroY_rms', 'gyroY_diff_mean', 'gyroY_diff_std', 'gyroY_diff_max',
    'gyroY_peak_position', 'gyroY_peak_value',
    'gyroZ_mean', 'gyroZ_std', 'gyroZ_min', 'gyroZ_max',
    'gyroZ_range', 'gyroZ_median', 'gyroZ_p25', 'gyroZ_p75',
    'gyroZ_iqr', 'gyroZ_skew', 'gyroZ_kurtosis', 'gyroZ_energy',
    'gyroZ_rms', 'gyroZ_diff_mean', 'gyroZ_diff_std', 'gyroZ_diff_max',
    'gyroZ_peak_position', 'gyroZ_peak_value',
]

def generate_realistic_features():
    """Generate semi-realistic IMU feature values."""
    features = {}
    features['rep_duration_ms'] = random.uniform(1500, 4000)
    features['sample_count'] = random.uniform(30, 100)
    features['avg_sample_rate'] = random.uniform(20, 50)
    
    # Sensor groups and realistic ranges
    sensor_groups = {
        'filteredMag': (8, 12),   # g magnitude
        'filteredX': (-5, 5),
        'filteredY': (-5, 5),
        'filteredZ': (7, 11),     # gravity component
        'accelMag': (8, 12),
        'accelX': (-3, 3),
        'accelY': (-3, 3),
        'accelZ': (7, 11),
        'gyroX': (-200, 200),     # deg/s
        'gyroY': (-200, 200),
        'gyroZ': (-100, 100),
    }
    
    stat_suffixes = ['mean', 'std', 'min', 'max', 'range', 'median', 'p25', 'p75',
                     'iqr', 'skew', 'kurtosis', 'energy', 'rms', 'diff_mean', 
                     'diff_std', 'diff_max', 'peak_position', 'peak_value']
    
    for group, (low, high) in sensor_groups.items():
        mean_val = random.uniform(low, high)
        std_val = abs(random.gauss(0, (high - low) * 0.15))
        
        features[f'{group}_mean'] = mean_val
        features[f'{group}_std'] = std_val
        features[f'{group}_min'] = mean_val - std_val * 2
        features[f'{group}_max'] = mean_val + std_val * 2
        features[f'{group}_range'] = std_val * 4
        features[f'{group}_median'] = mean_val + random.gauss(0, std_val * 0.1)
        features[f'{group}_p25'] = mean_val - std_val * 0.67
        features[f'{group}_p75'] = mean_val + std_val * 0.67
        features[f'{group}_iqr'] = std_val * 1.34
        features[f'{group}_skew'] = random.gauss(0, 0.5)
        features[f'{group}_kurtosis'] = random.uniform(-1, 3)
        features[f'{group}_energy'] = mean_val**2 * random.uniform(30, 100)
        features[f'{group}_rms'] = abs(mean_val) * random.uniform(0.95, 1.05)
        features[f'{group}_diff_mean'] = random.gauss(0, std_val * 0.3)
        features[f'{group}_diff_std'] = std_val * random.uniform(0.3, 0.8)
        features[f'{group}_diff_max'] = std_val * random.uniform(1, 3)
        features[f'{group}_peak_position'] = random.uniform(0.1, 0.9)
        features[f'{group}_peak_value'] = mean_val + std_val * random.uniform(1, 2.5)
    
    return features

def api_request(method, path, data=None):
    """Send a request to the API."""
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, method=method)
    if body:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    # Test 1: Health check
    print("=" * 60)
    print("TEST 1: Health Check")
    result = api_request("GET", "/")
    print(f"  Status: {result['status']}")
    print(f"  Models: {result['available_models']}")
    
    # Test 2: Model info
    print("\n" + "=" * 60)
    print("TEST 2: Model Info")
    for exercise in ["CONCENTRATION_CURLS", "LATERAL_PULLDOWN", "OVERHEAD_EXTENSIONS", "LEG_EXTENSION"]:
        info = api_request("GET", f"/model-info/{exercise}")
        print(f"\n  {exercise}:")
        print(f"    Classes: {info['class_names']}")
        print(f"    Features: {info['feature_count']}")
        print(f"    Trained: {info['training_date']}")
    
    # Test 3: Single classification
    print("\n" + "=" * 60)
    print("TEST 3: Single Classification (Concentration Curls)")
    features = generate_realistic_features()
    result = api_request("POST", "/classify", {
        "exercise_type": "CONCENTRATION_CURLS",
        "features": features
    })
    print(f"  Prediction: {result['prediction']} ({result['class_name']})")
    print(f"  Confidence: {result['confidence']:.2%}")
    print(f"  Probabilities: {[f'{p:.3f}' for p in result['probabilities']]}")
    
    # Test 4: All 4 available models
    print("\n" + "=" * 60)
    print("TEST 4: Classify Across All Available Models")
    exercises = ["CONCENTRATION_CURLS", "LATERAL_PULLDOWN", "OVERHEAD_EXTENSIONS", "LEG_EXTENSION"]
    for ex in exercises:
        features = generate_realistic_features()
        result = api_request("POST", "/classify", {
            "exercise_type": ex,
            "features": features
        })
        print(f"  {ex}: class={result['prediction']} ({result['class_name']}), confidence={result['confidence']:.2%}")
    
    # Test 5: Batch classification
    print("\n" + "=" * 60)
    print("TEST 5: Batch Classification (3 reps)")
    batch = [
        {"exercise_type": "CONCENTRATION_CURLS", "features": generate_realistic_features()},
        {"exercise_type": "CONCENTRATION_CURLS", "features": generate_realistic_features()},
        {"exercise_type": "LATERAL_PULLDOWN", "features": generate_realistic_features()},
    ]
    result = api_request("POST", "/batch-classify", batch)
    for i, r in enumerate(result['results']):
        print(f"  Rep {i+1}: class={r['prediction']} ({r['class_name']}), confidence={r['confidence']:.2%}")
    
    # Test 6: Missing model (should fail gracefully)
    print("\n" + "=" * 60)
    print("TEST 6: Invalid Model (Error Handling)")
    try:
        result = api_request("POST", "/classify", {
            "exercise_type": "NONEXISTENT_EXERCISE",
            "features": {"foo": 1.0}
        })
        print(f"  Unexpected success: {result}")
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode())
        print(f"  Correctly returned {e.code}: {body['detail']}")
    
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED!")

if __name__ == "__main__":
    main()
