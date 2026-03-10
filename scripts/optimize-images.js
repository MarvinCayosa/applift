const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const workoutCardsDir = path.join(__dirname, '..', 'public', 'images', 'workout-cards');
const targetMusclesDir = path.join(__dirname, '..', 'public', 'images', 'target-muscles');

async function optimizeDir(dir, files, format = 'jpeg') {
  for (const img of files) {
    const inputPath = path.join(dir, img.input);
    const ext = path.extname(img.input);
    const backupPath = path.join(dir, img.input.replace(ext, `-original${ext}`));
    const outputPath = path.join(dir, img.output);
    
    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${img.input} - not found`);
      continue;
    }
    
    // Backup original
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(inputPath, backupPath);
      console.log(`Backed up ${img.input}`);
    }
    
    const originalSize = fs.statSync(inputPath).size;
    
    // Optimize
    let pipeline = sharp(inputPath).resize(800, null, { withoutEnlargement: true });
    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 80, progressive: true });
    } else {
      pipeline = pipeline.png({ quality: 80, compressionLevel: 9 });
    }
    await pipeline.toFile(outputPath + '.tmp');
    
    fs.renameSync(outputPath + '.tmp', outputPath);
    
    const newSize = fs.statSync(outputPath).size;
    console.log(`${img.input}: ${(originalSize/1024).toFixed(0)}KB -> ${(newSize/1024).toFixed(0)}KB (${((1-newSize/originalSize)*100).toFixed(0)}% reduction)`);
  }
}

async function optimize() {
  // Target muscles (PNG)
  console.log('\n--- Target Muscles ---');
  await optimizeDir(targetMusclesDir, [
    { input: 'weight-stack-lateral-pulldown-muscles.png', output: 'weight-stack-lateral-pulldown-muscles.png' },
    { input: 'weight-stack-seated-leg-extension-muscles.png', output: 'weight-stack-seated-leg-extension-muscles.png' },
    { input: 'dumbbell-concentration-curls-muscles.png', output: 'dumbbell-concentration-curls-muscles.png' },
    { input: 'dumbbell-single-arm-overhead-extension-muscles.png', output: 'dumbbell-single-arm-overhead-extension-muscles.png' },
    { input: 'barbell-flat-bench-barbell-press-muscles.png', output: 'barbell-flat-bench-barbell-press-muscles.png' },
    { input: 'barbell-front-squats-muscles.png', output: 'barbell-front-squats-muscles.png' },
  ], 'png');
  
  console.log('\nDone!');
}

optimize().catch(console.error);
