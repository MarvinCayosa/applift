// Load environment first
require('dotenv').config();

const fetch = require('node-fetch');
const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');

// Initialize Firebase Admin (using existing credentials)
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };
  
  console.log('Firebase Auth Config:', {
    projectId: serviceAccount.projectId,
    clientEmail: serviceAccount.clientEmail ? 'Set' : 'Missing',
    privateKey: serviceAccount.privateKey ? 'Set (length: ' + serviceAccount.privateKey.length + ')' : 'Missing'
  });
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function testAIRecommendation() {
  try {
    // Create a test user token (you can also use a real user UID)
    const testUID = 'test_user_' + Date.now();
    const customToken = await getAuth().createCustomToken(testUID);
    
    // Test the API endpoint
    const response = await fetch('http://localhost:3001/api/ai-recommendation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customToken}`,
      },
      body: JSON.stringify({
        equipment: 'Barbell',
        exerciseName: 'Flat Bench Barbell Press',
        userProfile: {
          fitnessGoal: 'muscle_gain',
          strengthExperience: 'intermediate',
          weight: 75,
          weightUnit: 'kg',
          injuries: ['lower back']
        },
        pastSessions: [
          {
            date: '2026-02-20T10:00:00Z',
            weight: 80,
            sets: 3,
            reps: 8,
            avgFormScore: 85
          }
        ]
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API Test SUCCESS');
      console.log('📊 Recommendation:', data.recommendation);
      console.log('🧠 Reasoning:', data.reasoning);
    } else {
      console.log('❌ API Test FAILED');
      console.log('Error:', data.error);
      console.log('Status:', response.status);
    }
    
  } catch (error) {
    console.log('❌ Test Error:', error.message);
  }
}

// Run the test
testAIRecommendation();