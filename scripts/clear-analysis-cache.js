#!/usr/bin/env node

/**
 * Clear analysis cache from Firestore
 * Usage: node scripts/clear-analysis-cache.js [workoutId]
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../lib/firebase-admin-key.json');
const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = getFirestore(app);

async function clearAnalysisCache(workoutId = null) {
  try {
    console.log('🔍 Searching for analysis documents...');
    
    // Get all user workout analytics collections
    const userWorkoutsRef = db.collectionGroup('analytics');
    
    if (workoutId) {
      // Clear specific workout analysis
      console.log(`🎯 Clearing analysis for workoutId: ${workoutId}`);
      const query = userWorkoutsRef.where('workoutId', '==', workoutId);
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        console.log('❌ No analysis found for this workoutId');
        return;
      }
      
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        console.log(`🗑️ Deleting: ${doc.ref.path}`);
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`✅ Cleared ${snapshot.size} analysis document(s) for workoutId: ${workoutId}`);
      
    } else {
      // Clear all analysis (careful!)
      console.log('⚠️ Clearing ALL analysis documents...');
      const snapshot = await userWorkoutsRef.get();
      
      if (snapshot.empty) {
        console.log('❌ No analysis documents found');
        return;
      }
      
      console.log(`Found ${snapshot.size} analysis documents. Clearing in batches...`);
      
      const batchSize = 500;
      const batches = [];
      
      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = db.batch();
        const batchDocs = snapshot.docs.slice(i, i + batchSize);
        
        batchDocs.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        batches.push(batch.commit());
      }
      
      await Promise.all(batches);
      console.log(`✅ Cleared ${snapshot.size} analysis documents`);
    }
    
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
  } finally {
    process.exit(0);
  }
}

// Parse command line arguments
const workoutId = process.argv[2];

if (workoutId && workoutId === '--help') {
  console.log(`
Usage: node scripts/clear-analysis-cache.js [workoutId]

Examples:
  node scripts/clear-analysis-cache.js                    # Clear ALL analysis cache
  node scripts/clear-analysis-cache.js 20260220_wtw2s15ke0t  # Clear specific workout

⚠️ WARNING: Clearing cache will force re-analysis on next access.
`);
  process.exit(0);
}

clearAnalysisCache(workoutId);