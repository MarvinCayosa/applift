// Load environment first
require('dotenv').config();

// Test the AI service directly (bypasses authentication)
async function testVertexAIDirectly() {
  console.log('🧪 Testing Vertex AI Integration...\n');
  
  try {
    // Test Firebase Admin initialization
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized');
    }

    // Test Vertex AI connection
    const { VertexAI } = require('@google-cloud/vertexai');
    
    const googleAuthOptions = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      credentials: {
        client_email: process.env.VERTEX_AI_CLIENT_EMAIL,
        private_key: process.env.VERTEX_AI_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    };
    
    const vertex_ai = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
      googleAuthOptions,
    });
    
    console.log('✅ Vertex AI client initialized');

    // Test a simple generation
    const model = vertex_ai.preview.getGenerativeModel({
      model: process.env.VERTEX_AI_MODEL,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
      },
    });

    console.log('✅ Generative model loaded');
    console.log('🚀 Sending test prompt...\n');

    const prompt = `You are a certified fitness coach. Recommend weight, sets, and reps for:
    
Exercise: Flat Bench Barbell Press
Equipment: Barbell
User Profile: 75kg, intermediate, muscle gain goal
Past Sessions: Last session was 80kg x 3 sets x 8 reps

Respond with JSON only:
{
  "recommendation": {
    "weight": 85,
    "sets": 3, 
    "reps": 8,
    "restTimeSeconds": 180
  },
  "reasoning": {
    "safetyJustification": "Progressive overload with 5kg increase",
    "guidelineReference": "ACSM muscle gain: 6-12 reps at 70-85% 1RM",
    "progressionNotes": "Maintain form, increase weight gradually"
  }
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    
    // Handle different response formats
    let text;
    if (typeof response.text === 'function') {
      text = response.text();
    } else if (response.candidates && response.candidates[0]) {
      text = response.candidates[0].content.parts[0].text;
    } else {
      text = JSON.stringify(response, null, 2);
    }
    
    console.log('✅ SUCCESS! Vertex AI Response:');
    console.log(text);
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
      console.log('\n✅ JSON Parsing Success:');
      console.log('📊 Recommendation:', parsed.recommendation);
      console.log('🧠 Reasoning:', parsed.reasoning);
    } catch (parseError) {
      console.log('\n⚠️  Response received but JSON parsing failed:', parseError.message);
    }
    
  } catch (error) {
    console.log('❌ Test Failed:', error.message);
    if (error.code) console.log('Error Code:', error.code);
    if (error.details) console.log('Error Details:', error.details);
  }
}

// Run the test
testVertexAIDirectly();