#!/usr/bin/env python3
"""
Test script for ML Classification API
Run this to verify your local setup works correctly
"""

import requests
import json
import sys
import time

# API Configuration
API_BASE_URL = "http://localhost:8080"

def test_health_check():
    """Test the health check endpoint"""
    print("🏥 Testing health check...")
    try:
        response = requests.get(f"{API_BASE_URL}/")
        if response.status_code == 200:
            print("✅ Health check passed!")
            return True
        else:
            print(f"❌ Health check failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check failed: {str(e)}")
        return False

def test_models_endpoint():
    """Test the models listing endpoint"""
    print("\n📋 Testing models endpoint...")
    try:
        response = requests.get(f"{API_BASE_URL}/models")
        if response.status_code == 200:
            data = response.json()
            print("✅ Models endpoint works!")
            print(f"Available models: {len(data.get('models', []))}")
            for model in data.get('models', []):
                print(f"  - {model['exercise_type']}: {model['model_file']}")
            return True
        else:
            print(f"❌ Models endpoint failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Models endpoint failed: {str(e)}")
        return False

def test_classification():
    """Test the classification endpoint"""
    print("\n🧠 Testing classification endpoint...")
    
    # Sample workout data for testing
    test_data = {
        "exercise_type": "CONCENTRATION_CURLS",
        "features": {
            "mean_acceleration_x": 0.5,
            "mean_acceleration_y": 0.3,
            "mean_acceleration_z": 0.8,
            "max_acceleration": 2.1,
            "min_acceleration": 0.1,
            "mean_gyro_x": 1.2,
            "mean_gyro_y": 0.8,
            "mean_gyro_z": 0.5,
            "max_angular_velocity": 3.5,
            "rep_duration": 2.5,
            "peaks_count": 2,
            "smoothness": 0.85,
            "consistency": 0.90,
            "range_of_motion": 95.0
        }
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/classify",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Classification successful!")
            print(f"Prediction: {result['prediction']}")
            print(f"Confidence: {result['confidence']:.3f}")
            print(f"Exercise: {result['exercise_type']}")
            print(f"Model: {result['model_used']}")
            
            # Interpret results
            quality_labels = ['Poor', 'Fair', 'Good', 'Excellent']
            quality = quality_labels[min(result['prediction'], len(quality_labels) - 1)]
            print(f"Quality Assessment: {quality}")
            
            return True
        else:
            print(f"❌ Classification failed with status {response.status_code}")
            print(f"Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Classification failed: {str(e)}")
        return False

def test_batch_classification():
    """Test the batch classification endpoint"""
    print("\n📦 Testing batch classification...")
    
    batch_data = [
        {
            "exercise_type": "CONCENTRATION_CURLS",
            "features": {
                "mean_acceleration_x": 0.5,
                "mean_acceleration_y": 0.3,
                "range_of_motion": 95.0
            }
        },
        {
            "exercise_type": "LATERAL_PULLDOWN",
            "features": {
                "mean_acceleration_x": 0.7,
                "mean_acceleration_y": 0.4,
                "range_of_motion": 85.0
            }
        }
    ]
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/batch-classify",
            json=batch_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Batch classification successful!")
            print(f"Processed {len(result['results'])} exercises")
            for i, res in enumerate(result['results']):
                if 'error' in res:
                    print(f"  {i+1}. Error: {res['error']}")
                else:
                    print(f"  {i+1}. {res['exercise_type']}: prediction={res['prediction']}, confidence={res['confidence']:.3f}")
            return True
        else:
            print(f"❌ Batch classification failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Batch classification failed: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("🚀 Starting ML Classification API Tests")
    print("=" * 50)
    
    # Wait a moment for server to be ready
    time.sleep(1)
    
    tests = [
        test_health_check,
        test_models_endpoint,
        test_classification,
        test_batch_classification
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        time.sleep(0.5)  # Small delay between tests
    
    print("\n" + "=" * 50)
    print(f"🎯 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Your ML API is working correctly.")
        return 0
    else:
        print("⚠️ Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())