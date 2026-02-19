import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import json
from sklearn.preprocessing import StandardScaler
from scipy.signal import find_peaks
import warnings
import tkinter as tk
from tkinter import filedialog, ttk
import os
from pathlib import Path
warnings.filterwarnings('ignore')

# Get the script's directory and project root
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent

# Paths for data and output
DATA_DIR = PROJECT_ROOT / 'data'
VIZ_DIR = PROJECT_ROOT / 'visualizations' / 'csv-analysis'
DATASETS_DIR = PROJECT_ROOT / 'datasets'

# Ensure directories exist
VIZ_DIR.mkdir(parents=True, exist_ok=True)

# Set style for better visualizations
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (15, 10)

# ==================== FILE SELECTION UI ====================
def select_csv_file():
    """
    Open a file dialog to select a CSV file for analysis
    Returns the selected file path or None if cancelled
    """
    # Create root window (hidden)
    root = tk.Tk()
    root.withdraw()
    
    # Set default directory to data folder if it exists
    initial_dir = str(DATA_DIR)
    if not os.path.exists(initial_dir):
        initial_dir = str(SCRIPT_DIR)
    
    # Open file dialog
    file_path = filedialog.askopenfilename(
        title="Select Dataset for Analysis (CSV or JSON)",
        initialdir=initial_dir,
        filetypes=[
            ("CSV files", "*.csv"),
            ("JSON files", "*.json"),
            ("All files", "*.*")
        ]
    )
    
    root.destroy()
    
    if file_path:
        return file_path
    else:
        return None

def select_from_datasets_ui():
    """
    Show a UI to browse and select from the datasets folder structure
    """
    root = tk.Tk()
    root.title("📊 Select Dataset for Analysis")
    root.geometry("600x500")
    root.configure(bg='#f0f0f0')
    
    selected_file = [None]  # Use list to allow modification in nested function
    
    # Header
    header = tk.Label(root, text="🏋️ AppLift Dataset Selector", 
                      font=('Arial', 16, 'bold'), bg='#f0f0f0', fg='#333')
    header.pack(pady=10)
    
    # Instructions
    instructions = tk.Label(root, text="Select a CSV or JSON file from the tree below or browse for a file:",
                           font=('Arial', 10), bg='#f0f0f0', fg='#666')
    instructions.pack(pady=5)
    
    # Frame for treeview
    tree_frame = tk.Frame(root, bg='#f0f0f0')
    tree_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
    
    # Scrollbar
    scrollbar = ttk.Scrollbar(tree_frame)
    scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
    
    # Treeview for folder structure
    tree = ttk.Treeview(tree_frame, yscrollcommand=scrollbar.set)
    tree.pack(fill=tk.BOTH, expand=True)
    scrollbar.config(command=tree.yview)
    
    tree.heading('#0', text='Datasets', anchor='w')
    
    # Populate tree with datasets folder structure - use defined constants
    datasets_dir = str(DATASETS_DIR)
    data_dir = str(DATA_DIR)
    
    def populate_tree(parent, path):
        """Recursively populate tree with folder contents"""
        try:
            items = sorted(os.listdir(path))
            for item in items:
                item_path = os.path.join(path, item)
                if os.path.isdir(item_path):
                    # Folder - add with folder icon
                    node = tree.insert(parent, 'end', text=f"📁 {item}", open=False, values=(item_path,))
                    populate_tree(node, item_path)
                elif item.endswith(('.csv', '.json')):
                    # CSV/JSON file - add with file icon
                    icon = "📄" if item.endswith('.csv') else "📋"
                    tree.insert(parent, 'end', text=f"{icon} {item}", values=(item_path,))
        except PermissionError:
            pass
    
    # Add datasets folder
    if os.path.exists(datasets_dir):
        datasets_node = tree.insert('', 'end', text='📁 datasets', open=True, values=(datasets_dir,))
        populate_tree(datasets_node, datasets_dir)
    
    # Add data folder
    if os.path.exists(data_dir):
        data_node = tree.insert('', 'end', text='📁 data', open=True, values=(data_dir,))
        populate_tree(data_node, data_dir)
    
    # Selected file label
    selected_label = tk.Label(root, text="Selected: None", 
                              font=('Arial', 10), bg='#f0f0f0', fg='#007bff')
    selected_label.pack(pady=5)
    
    def on_select(event):
        """Handle tree selection"""
        selection = tree.selection()
        if selection:
            item = tree.item(selection[0])
            values = item.get('values', [])
            if values:
                path = values[0]
                if path.endswith(('.csv', '.json')):
                    selected_file[0] = path
                    filename = os.path.basename(path)
                    selected_label.config(text=f"Selected: {filename}", fg='#28a745')
    
    def on_double_click(event):
        """Handle double-click to select and confirm"""
        selection = tree.selection()
        if selection:
            item = tree.item(selection[0])
            values = item.get('values', [])
            if values:
                path = values[0]
                if path.endswith(('.csv', '.json')):
                    selected_file[0] = path
                    root.destroy()
    
    tree.bind('<<TreeviewSelect>>', on_select)
    tree.bind('<Double-1>', on_double_click)
    
    # Button frame
    btn_frame = tk.Frame(root, bg='#f0f0f0')
    btn_frame.pack(pady=10)
    
    def browse_file():
        """Open file browser"""
        file_path = filedialog.askopenfilename(
            title="Select Dataset (CSV or JSON)",
            filetypes=[("CSV files", "*.csv"), ("JSON files", "*.json"), ("All files", "*.*")]
        )
        if file_path:
            selected_file[0] = file_path
            filename = os.path.basename(file_path)
            selected_label.config(text=f"Selected: {filename}", fg='#28a745')
            root.destroy()
    
    def confirm_selection():
        """Confirm the current selection"""
        if selected_file[0]:
            root.destroy()
        else:
            selected_label.config(text="⚠️ Please select a CSV or JSON file first!", fg='red')
    
    def cancel():
        """Cancel and exit"""
        selected_file[0] = None
        root.destroy()
    
    browse_btn = tk.Button(btn_frame, text="📂 Browse...", command=browse_file,
                          font=('Arial', 10), bg='#6c757d', fg='white', 
                          padx=15, pady=5, cursor='hand2')
    browse_btn.pack(side=tk.LEFT, padx=5)
    
    confirm_btn = tk.Button(btn_frame, text="✅ Analyze Selected", command=confirm_selection,
                           font=('Arial', 10, 'bold'), bg='#28a745', fg='white',
                           padx=15, pady=5, cursor='hand2')
    confirm_btn.pack(side=tk.LEFT, padx=5)
    
    cancel_btn = tk.Button(btn_frame, text="❌ Cancel", command=cancel,
                          font=('Arial', 10), bg='#dc3545', fg='white',
                          padx=15, pady=5, cursor='hand2')
    cancel_btn.pack(side=tk.LEFT, padx=5)
    
    # Center the window
    root.update_idletasks()
    x = (root.winfo_screenwidth() - root.winfo_width()) // 2
    y = (root.winfo_screenheight() - root.winfo_height()) // 2
    root.geometry(f"+{x}+{y}")
    
    root.mainloop()
    
    return selected_file[0]

# ==================== JSON LOADING FUNCTION ====================
def load_json_data(json_file_path):
    """
    Load JSON workout data and convert it to DataFrame format compatible with CSV processing
    
    Parameters:
    json_file_path: Path to the JSON workout data file
    
    Returns:
    pd.DataFrame: Flattened sensor data with same structure as CSV data
    """
    print(f"📋 Loading JSON data from: {json_file_path}")
    
    with open(json_file_path, 'r') as f:
        workout_data = json.load(f)
    
    # Extract metadata
    exercise = workout_data.get('exercise', 'Unknown Exercise')
    equipment = workout_data.get('equipment', 'Unknown Equipment')
    weight = workout_data.get('weight', 'Unknown')
    weight_unit = workout_data.get('weightUnit', '')
    
    print(f"📊 Workout Info: {exercise} with {equipment}")
    print(f"🏋️ Weight: {weight} {weight_unit}")
    
    # Flatten all samples from all sets and reps into a single DataFrame
    all_samples = []
    global_timestamp_offset = 0
    global_rep_counter = 1  # Global rep counter across all sets
    
    for set_data in workout_data.get('sets', []):
        set_number = set_data.get('setNumber', 1)
        print(f"  📦 Processing Set {set_number}...")
        
        for rep_data in set_data.get('reps', []):
            rep_number_in_set = rep_data.get('repNumber', 1)  # Rep number within the set
            samples = rep_data.get('samples', [])
            
            print(f"    🔄 Rep {rep_number_in_set} (Global Rep {global_rep_counter}): {len(samples)} samples")
            
            # Process each sample and add to the global list
            for sample in samples:
                # Create a copy of the sample to avoid modifying original
                processed_sample = sample.copy()
                
                # Ensure we have global continuous timestamps
                processed_sample['timestamp_ms'] = sample['timestamp_ms'] + global_timestamp_offset
                
                # Add metadata with both set and global rep tracking
                processed_sample['set'] = set_number
                processed_sample['rep_in_set'] = rep_number_in_set  # Rep number within the set
                processed_sample['rep'] = global_rep_counter  # Global unique rep number
                processed_sample['exercise'] = exercise
                processed_sample['equipment'] = equipment
                processed_sample['weight'] = weight
                
                all_samples.append(processed_sample)
            
            # Update global timestamp offset for next rep
            if samples:
                # Add a small gap between reps (100ms) to maintain separation
                last_timestamp = samples[-1]['timestamp_ms']
                global_timestamp_offset += last_timestamp + 100
                
            # Increment global rep counter
            global_rep_counter += 1
    
    # Convert to DataFrame
    df = pd.DataFrame(all_samples)
    
    if len(df) == 0:
        raise ValueError("No sample data found in JSON file")
    
    print(f"✅ Loaded {len(df)} total samples from JSON")
    print(f"📈 Sets: {df['set'].nunique()}, Total Reps: {df['rep'].nunique()}")
    print(f"🕐 Time range: {df['timestamp_ms'].min():.0f}ms - {df['timestamp_ms'].max():.0f}ms")
    
    # Show breakdown by set
    for set_num in sorted(df['set'].unique()):
        set_data = df[df['set'] == set_num]
        unique_reps_in_set = set_data['rep_in_set'].nunique() if 'rep_in_set' in df.columns else set_data['rep'].nunique()
        print(f"  📦 Set {set_num}: {unique_reps_in_set} reps, {len(set_data)} samples")
    
    return df

# ==================== 1. LOAD DATA ====================
print("=" * 60)
print("LOADING DATA FROM FILE")
print("=" * 60)

# Show file selection UI
print("\n📂 Opening file selection dialog...")
data_file = select_from_datasets_ui()

if data_file is None:
    print("\n❌ No file selected. Exiting.")
    exit()

print(f"\n✓ Selected file: {data_file}")

# Detect file type and load accordingly
file_extension = os.path.splitext(data_file)[1].lower()
print(f"📄 File type detected: {file_extension}")

if file_extension == '.csv':
    print("🔄 Loading CSV file...")
    df = pd.read_csv(data_file)
elif file_extension == '.json':
    print("🔄 Loading JSON file...")
    df = load_json_data(data_file)
else:
    raise ValueError(f"Unsupported file type: {file_extension}. Please select a CSV or JSON file.")

# Ensure we have the required columns
required_columns = ['timestamp_ms', 'rep', 'accelMag', 'filteredMag']
missing_columns = [col for col in required_columns if col not in df.columns]
if missing_columns:
    raise ValueError(f"Missing required columns: {missing_columns}")

print(f"✅ Data loaded successfully!")

# Use the existing timestamp_ms as is (it's already continuous across reps)
# Just create a reference for plotting - no modification needed
df['cumulative_timestamp_ms'] = df['timestamp_ms']

print(f"\nData File: {data_file}")
print(f"Data shape: {df.shape}")
print(f"\nColumns: {df.columns.tolist()}")
print(f"\nFirst few rows:\n{df.head()}")
print(f"\nRep counts (global): {df.groupby('rep').size()}")

# Show set and rep breakdown if we have set information
if 'set' in df.columns:
    print(f"\nSet breakdown:")
    set_rep_summary = df.groupby(['set', 'rep_in_set' if 'rep_in_set' in df.columns else 'rep']).size().reset_index(name='samples')
    for set_num in sorted(df['set'].unique()):
        set_data = set_rep_summary[set_rep_summary['set'] == set_num]
        rep_count = len(set_data)
        total_samples = set_data['samples'].sum()
        print(f"  Set {set_num}: {rep_count} reps, {total_samples} total samples")
        for _, row in set_data.iterrows():
            rep_col = 'rep_in_set' if 'rep_in_set' in df.columns else 'rep'
            global_rep = df[(df['set'] == set_num) & (df[rep_col] == row[rep_col])]['rep'].iloc[0]
            print(f"    Rep {int(row[rep_col])} (Global Rep {global_rep}): {row['samples']} samples")

# ==================== 2. GRAPH REPS WITH SEGMENTATION ====================
print("\n" + "=" * 60)
print("GRAPHING REPS WITH SEGMENTATION")
print("=" * 60)

fig, axes = plt.subplots(3, 1, figsize=(15, 10))
fig.suptitle('Sensor Data Segmented by Sets and Reps', fontsize=16, fontweight='bold')

# Get sorted unique reps and sets
sorted_reps = sorted(df['rep'].unique())
sorted_sets = sorted(df['set'].unique())

# Calculate rep boundaries that are continuous (no visual gaps)
rep_boundaries = {}
for i, rep_num in enumerate(sorted_reps):
    rep_data = df[df['rep'] == rep_num]
    start_time = rep_data['cumulative_timestamp_ms'].min()
    
    # For the end time: use the START of the next rep (to eliminate gaps)
    if i < len(sorted_reps) - 1:
        next_rep = sorted_reps[i + 1]
        next_rep_data = df[df['rep'] == next_rep]
        end_time = next_rep_data['cumulative_timestamp_ms'].min()
    else:
        # Last rep: use its actual max
        end_time = rep_data['cumulative_timestamp_ms'].max()
    
    rep_boundaries[rep_num] = (start_time, end_time)

# Calculate set boundaries for visualization
set_boundaries = {}
set_colors = ['lightblue', 'lightgreen', 'lightcoral', 'lightyellow', 'lightpink', 'lightgray']
for i, set_num in enumerate(sorted_sets):
    set_data = df[df['set'] == set_num]
    start_time = set_data['cumulative_timestamp_ms'].min()
    end_time = set_data['cumulative_timestamp_ms'].max()
    set_boundaries[set_num] = (start_time, end_time)

print(f"  📊 Found {len(sorted_sets)} sets with {len(sorted_reps)} total reps")

# *** FIND TURNING POINTS (valleys and peaks) for visualization ***
from scipy.signal import find_peaks, savgol_filter

# Smooth the signal for better peak/valley detection
signal = df['filteredMag'].values
timestamps = df['cumulative_timestamp_ms'].values

if len(signal) > 11:
    signal_smooth = savgol_filter(signal, window_length=11, polyorder=3)
else:
    signal_smooth = signal

# Find peaks (local maxima)
peaks, peak_props = find_peaks(signal_smooth, distance=10, prominence=0.3)
peak_times = timestamps[peaks]
peak_values = signal[peaks]

# Find valleys (local minima) by inverting signal
valleys, valley_props = find_peaks(-signal_smooth, distance=10, prominence=0.3)
valley_times = timestamps[valleys]
valley_values = signal[valleys]

print(f"  Found {len(peaks)} peaks and {len(valleys)} valleys")

# Plot acceleration magnitude with turning points
axes[0].plot(df['cumulative_timestamp_ms'], df['accelMag'], linewidth=1, alpha=0.7, label='Accel Mag')

# Add set boundaries as colored background regions
for i, set_num in enumerate(sorted_sets):
    start_time, end_time = set_boundaries[set_num]
    color = set_colors[i % len(set_colors)]
    axes[0].axvspan(start_time, end_time, alpha=0.15, color=color, label=f'Set {set_num}')
    
    # Add thick vertical lines at set starts (except first set)
    if i > 0:
        axes[0].axvline(x=start_time, color='black', linestyle='-', linewidth=3, alpha=0.8)

# Add rep boundaries as light vertical lines
for rep_num in sorted_reps:
    start_time, end_time = rep_boundaries[rep_num]
    rep_set = df[df['rep'] == rep_num]['set'].iloc[0]
    rep_in_set = df[df['rep'] == rep_num]['rep_in_set'].iloc[0] if 'rep_in_set' in df.columns else rep_num
    axes[0].axvline(x=start_time, color='gray', linestyle='--', alpha=0.5, linewidth=1)

# Add peaks and valleys
axes[0].scatter(peak_times, df['accelMag'].values[peaks], color='green', s=80, marker='^', 
                zorder=5, label='Peaks', edgecolors='darkgreen', linewidths=1)
axes[0].scatter(valley_times, df['accelMag'].values[valleys], color='red', s=80, marker='v', 
                zorder=5, label='Valleys', edgecolors='darkred', linewidths=1)
axes[0].set_xlabel('Time (ms)')
axes[0].set_ylabel('Acceleration Magnitude')
axes[0].set_title('Acceleration Magnitude by Sets and Reps (with Turning Points)')
axes[0].legend(loc='upper right', ncol=3, fontsize=8)
axes[0].grid(True, alpha=0.3)

# Plot filtered magnitude with turning points
axes[1].plot(df['cumulative_timestamp_ms'], df['filteredMag'], linewidth=1, alpha=0.7, color='orange', label='Filtered Mag')

# Add set boundaries as colored background regions
for i, set_num in enumerate(sorted_sets):
    start_time, end_time = set_boundaries[set_num]
    color = set_colors[i % len(set_colors)]
    axes[1].axvspan(start_time, end_time, alpha=0.15, color=color)
    
    # Add thick vertical lines at set starts (except first set)
    if i > 0:
        axes[1].axvline(x=start_time, color='black', linestyle='-', linewidth=3, alpha=0.8)

# Add rep boundaries as light vertical lines
for rep_num in sorted_reps:
    start_time, end_time = rep_boundaries[rep_num]
    axes[1].axvline(x=start_time, color='gray', linestyle='--', alpha=0.5, linewidth=1)

# Add peaks and valleys (using filtered signal values)
axes[1].scatter(peak_times, peak_values, color='green', s=80, marker='^', 
                zorder=5, label='Peaks', edgecolors='darkgreen', linewidths=1)
axes[1].scatter(valley_times, valley_values, color='red', s=80, marker='v', 
                zorder=5, label='Valleys', edgecolors='darkred', linewidths=1)

# Add vertical lines at valley positions to show rep boundaries
for vt in valley_times:
    axes[1].axvline(x=vt, color='red', linestyle='--', alpha=0.5, linewidth=1)
    
axes[1].set_xlabel('Time (ms)')
axes[1].set_ylabel('Filtered Magnitude')
axes[1].set_title('Filtered Magnitude by Sets and Reps (with Turning Points)')
axes[1].legend(loc='upper right', fontsize=8)
axes[1].grid(True, alpha=0.3)

# Plot gyroscope data
axes[2].plot(df['cumulative_timestamp_ms'], df['gyroX'], label='Gyro X', alpha=0.7)
axes[2].plot(df['cumulative_timestamp_ms'], df['gyroY'], label='Gyro Y', alpha=0.7)
axes[2].plot(df['cumulative_timestamp_ms'], df['gyroZ'], label='Gyro Z', alpha=0.7)

# Add set boundaries as colored background regions
for i, set_num in enumerate(sorted_sets):
    start_time, end_time = set_boundaries[set_num]
    color = set_colors[i % len(set_colors)]
    axes[2].axvspan(start_time, end_time, alpha=0.15, color=color)
    
    # Add thick vertical lines at set starts (except first set)
    if i > 0:
        axes[2].axvline(x=start_time, color='black', linestyle='-', linewidth=3, alpha=0.8, label='Set Boundary' if i == 1 else "")

# Add rep boundaries as light vertical lines
for rep_num in sorted_reps:
    start_time, end_time = rep_boundaries[rep_num]
    axes[2].axvline(x=start_time, color='gray', linestyle='--', alpha=0.5, linewidth=1, label='Rep Boundary' if rep_num == sorted_reps[1] else "")

axes[2].set_xlabel('Time (ms)')
axes[2].set_ylabel('Angular Velocity')
axes[2].set_title('Gyroscope Data by Sets and Reps')
axes[2].legend(fontsize=8)
axes[2].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(VIZ_DIR / 'segmentation_visualization.png', dpi=300, bbox_inches='tight')
print(f"✓ Segmentation graph saved to '{VIZ_DIR / 'segmentation_visualization.png'}'")
plt.show()

# ==================== 3. FEATURE EXTRACTION ====================
print("\n" + "=" * 60)
print("EXTRACTING FEATURES")
print("=" * 60)

def calculate_ldlj(accel_x, accel_y, accel_z, dt_seconds):
    """
    Calculate Log-Dimensionless Jerk (LDLJ) using the correct formula:
    LDLJ = -ln((t2-t1) / a_peak^2 * ∫(ẍ² + ÿ² + z̈²) dt)
    
    Where:
    - (t2-t1) is the movement duration in seconds
    - a_peak is the peak acceleration amplitude
    - ẍ, ÿ, z̈ are the jerk (derivative of acceleration) in each axis
    
    More negative LDLJ = smoother movement
    Less negative (closer to 0) = jerkier movement
    
    Parameters:
    - accel_x, accel_y, accel_z: acceleration data arrays for each axis
    - dt_seconds: time step between samples in seconds
    """
    # Calculate jerk (derivative of acceleration) for each axis
    jerk_x = np.diff(accel_x) / dt_seconds
    jerk_y = np.diff(accel_y) / dt_seconds
    jerk_z = np.diff(accel_z) / dt_seconds
    
    # Calculate squared jerk sum: ẍ² + ÿ² + z̈²
    squared_jerk_sum = jerk_x**2 + jerk_y**2 + jerk_z**2
    
    # Integrate squared jerk over time (using trapezoidal rule approximation)
    # ∫(ẍ² + ÿ² + z̈²) dt ≈ sum(squared_jerk) * dt
    jerk_integral = np.sum(squared_jerk_sum) * dt_seconds
    
    # Calculate movement duration (t2 - t1)
    movement_duration = len(accel_x) * dt_seconds
    
    # Calculate peak acceleration amplitude (magnitude)
    accel_magnitude = np.sqrt(accel_x**2 + accel_y**2 + accel_z**2)
    a_peak = np.max(accel_magnitude)
    
    # Prevent division by zero
    if a_peak <= 0:
        a_peak = 1e-6
    if jerk_integral <= 0:
        jerk_integral = 1e-6
    if movement_duration <= 0:
        movement_duration = 1e-6
    
    # LDLJ = -ln((t2-t1) / a_peak^2 * jerk_integral)
    ldlj_value = -np.log((movement_duration / (a_peak ** 2)) * jerk_integral)
    
    return ldlj_value


def calculate_ldlj_single_axis(acceleration_data, dt_seconds):
    """
    Calculate LDLJ for a single axis (simplified version)
    LDLJ = -ln((t2-t1) / a_peak^2 * ∫(ẍ²) dt)
    
    More negative = smoother, closer to 0 = jerkier
    """
    # Calculate jerk (derivative of acceleration)
    jerk = np.diff(acceleration_data) / dt_seconds
    
    # Squared jerk integral
    squared_jerk = jerk ** 2
    jerk_integral = np.sum(squared_jerk) * dt_seconds
    
    # Movement duration
    movement_duration = len(acceleration_data) * dt_seconds
    
    # Peak acceleration
    a_peak = np.max(np.abs(acceleration_data))
    
    # Prevent division by zero
    if a_peak <= 0:
        a_peak = 1e-6
    if jerk_integral <= 0:
        jerk_integral = 1e-6
    if movement_duration <= 0:
        movement_duration = 1e-6
    
    ldlj_value = -np.log((movement_duration / (a_peak ** 2)) * jerk_integral)
    
    return ldlj_value

def calculate_range_of_motion(angle_data):
    """Calculate the range of motion (max - min)"""
    return np.max(angle_data) - np.min(angle_data)

def extract_features_per_rep(rep_data):
    """Extract comprehensive features for a single rep"""
    features = {}
    
    # Basic statistics for acceleration
    features['accel_mean'] = rep_data['accelMag'].mean()
    features['accel_std'] = rep_data['accelMag'].std()
    features['accel_max'] = rep_data['accelMag'].max()
    features['accel_min'] = rep_data['accelMag'].min()
    
    # Filtered acceleration statistics
    features['filtered_mean'] = rep_data['filteredMag'].mean()
    features['filtered_std'] = rep_data['filteredMag'].std()
    features['filtered_max'] = rep_data['filteredMag'].max()
    features['filtered_min'] = rep_data['filteredMag'].min()
    
    # Calculate time step (dt) from timestamp data
    # Assuming timestamps are in milliseconds
    timestamps_ms = rep_data['timestamp_ms'].values
    if len(timestamps_ms) > 1:
        dt_seconds = np.mean(np.diff(timestamps_ms)) / 1000.0  # Convert ms to seconds
    else:
        dt_seconds = 0.1  # Default 100ms if can't calculate
    
    # LDLJ (Log-Dimensionless Jerk) - using correct formula
    # 3-axis LDLJ (combines X, Y, Z accelerations)
    features['ldlj_3axis'] = calculate_ldlj(
        rep_data['accelX'].values,
        rep_data['accelY'].values,
        rep_data['accelZ'].values,
        dt_seconds
    )
    
    # Filtered 3-axis LDLJ
    features['ldlj_filtered_3axis'] = calculate_ldlj(
        rep_data['filteredX'].values,
        rep_data['filteredY'].values,
        rep_data['filteredZ'].values,
        dt_seconds
    )
    
    # Single-axis LDLJ (for individual axis analysis)
    features['ldlj_accelMag'] = calculate_ldlj_single_axis(rep_data['accelMag'].values, dt_seconds)
    features['ldlj_filteredMag'] = calculate_ldlj_single_axis(rep_data['filteredMag'].values, dt_seconds)
    features['ldlj_accelX'] = calculate_ldlj_single_axis(rep_data['accelX'].values, dt_seconds)
    features['ldlj_accelY'] = calculate_ldlj_single_axis(rep_data['accelY'].values, dt_seconds)
    features['ldlj_accelZ'] = calculate_ldlj_single_axis(rep_data['accelZ'].values, dt_seconds)
    
    # Range of Motion (ROM)
    features['rom_roll'] = calculate_range_of_motion(rep_data['roll'].values)
    features['rom_pitch'] = calculate_range_of_motion(rep_data['pitch'].values)
    features['rom_yaw'] = calculate_range_of_motion(rep_data['yaw'].values)
    
    # Gyroscope statistics
    features['gyro_x_mean'] = rep_data['gyroX'].mean()
    features['gyro_y_mean'] = rep_data['gyroY'].mean()
    features['gyro_z_mean'] = rep_data['gyroZ'].mean()
    features['gyro_x_max'] = np.max(np.abs(rep_data['gyroX']))
    features['gyro_y_max'] = np.max(np.abs(rep_data['gyroY']))
    features['gyro_z_max'] = np.max(np.abs(rep_data['gyroZ']))
    
    # Duration (total time of the segment)
    features['duration_ms'] = rep_data['timestamp_ms'].max() - rep_data['timestamp_ms'].min()
    features['duration_sec'] = features['duration_ms'] / 1000.0
    
    # Eccentric/Concentric Phase Detection and Ratio
    # NEW METHOD: Using primary movement axis to detect phases (more accurate for exercise mechanics)
    # Concentric = time BEFORE peak (lifting/pushing phase - increasing acceleration)
    # Eccentric = time AFTER peak (lowering/returning phase - decreasing acceleration)
    
    timestamps = rep_data['timestamp_ms'].values
    
    # Determine the primary movement axis (highest range of motion)
    accel_x_range = rep_data['accelX'].max() - rep_data['accelX'].min()
    accel_y_range = rep_data['accelY'].max() - rep_data['accelY'].min()
    accel_z_range = rep_data['accelZ'].max() - rep_data['accelZ'].min()
    
    # Find which axis has the highest range of motion (primary movement axis)
    axis_ranges = {'X': accel_x_range, 'Y': accel_y_range, 'Z': accel_z_range}
    primary_axis = max(axis_ranges, key=axis_ranges.get)
    
    if primary_axis == 'X':
        primary_signal = rep_data['accelX'].values
        axis_name = 'accelX'
    elif primary_axis == 'Y':
        primary_signal = rep_data['accelY'].values
        axis_name = 'accelY'
    else:  # Z
        primary_signal = rep_data['accelZ'].values
        axis_name = 'accelZ'
    
    # Find the MAIN peak on the primary movement axis
    peak_idx = np.argmax(np.abs(primary_signal))  # Use absolute value to catch both positive and negative peaks
    
    # Alternative: Use scipy's find_peaks for more sophisticated peak detection
    peaks_pos, _ = find_peaks(primary_signal, distance=10, prominence=0.5)
    peaks_neg, _ = find_peaks(-primary_signal, distance=10, prominence=0.5)
    
    # Combine positive and negative peaks and find the most prominent
    all_peaks = np.concatenate([peaks_pos, peaks_neg])
    if len(all_peaks) > 0:
        peak_amplitudes = np.abs(primary_signal[all_peaks])
        main_peak_idx = all_peaks[np.argmax(peak_amplitudes)]
        transition_idx = main_peak_idx
        peak_type = "positive" if primary_signal[main_peak_idx] > 0 else "negative"
    else:
        # Fallback to maximum absolute value if no peaks detected
        transition_idx = peak_idx
        peak_type = "positive" if primary_signal[peak_idx] > 0 else "negative"
    
    # PREVIOUS METHOD (commented out for comparison):
    # accel_mag = rep_data['accelMag'].values
    # peak_idx = np.argmax(accel_mag)
    # peaks, peak_properties = find_peaks(accel_mag, distance=10, prominence=0.5)
    # if len(peaks) > 0:
    #     peak_amplitudes = accel_mag[peaks]
    #     main_peak_idx = peaks[np.argmax(peak_amplitudes)]
    #     transition_idx = main_peak_idx
    # else:
    #     transition_idx = peak_idx
    
    # Split into concentric (before peak) and eccentric (after peak) phases
    concentric_duration = timestamps[transition_idx] - timestamps[0] if transition_idx > 0 else 0
    eccentric_duration = timestamps[-1] - timestamps[transition_idx] if transition_idx < len(rep_data) else 0
    
    
    features['eccentric_duration_ms'] = eccentric_duration
    features['concentric_duration_ms'] = concentric_duration
    features['eccentric_duration_sec'] = eccentric_duration / 1000.0
    features['concentric_duration_sec'] = concentric_duration / 1000.0
    
    # Concentric to Eccentric Ratio (important for tempo control)
    # Typically, eccentric should be longer for controlled movements
    if eccentric_duration > 0:
        features['concentric_eccentric_ratio'] = concentric_duration / eccentric_duration
    else:
        features['concentric_eccentric_ratio'] = 0
    
    # Peak location (as percentage of total duration)
    features['peak_time_percentage'] = (transition_idx / len(rep_data)) * 100 if len(rep_data) > 0 else 0
    
    # Phase proportions (as percentage of total duration)
    total_duration = concentric_duration + eccentric_duration
    if total_duration > 0:
        features['concentric_percentage'] = (concentric_duration / total_duration) * 100
        features['eccentric_percentage'] = (eccentric_duration / total_duration) * 100
    else:
        features['concentric_percentage'] = 0
        features['eccentric_percentage'] = 0
    
    # Peaks in acceleration (for movement quality assessment)
    features['num_peaks'] = len(peaks)
    
    # Smoothness - Multiple approaches for better assessment
    # Using primary movement axis for more accurate smoothness assessment
    jerk = np.diff(primary_signal)
    
    # Method 1: Normalized Dimensionless Jerk (NDJ)
    # Lower values = smoother movement
    movement_duration = len(rep_data) - 1
    movement_amplitude = np.max(primary_signal) - np.min(primary_signal)
    if movement_amplitude > 0 and movement_duration > 0:
        features['normalized_jerk'] = np.sqrt(np.sum(jerk ** 2) / movement_duration) / movement_amplitude
    else:
        features['normalized_jerk'] = 0
    
    # Method 2: Spectral Arc Length (SPARC) - simplified version
    # Measures smoothness based on consistency of movement
    features['jerk_std'] = np.std(jerk) if len(jerk) > 0 else 0
    features['jerk_mean'] = np.mean(np.abs(jerk)) if len(jerk) > 0 else 0
    
    # Method 3: Number of direction changes (acceleration reversals)
    jerk_sign_changes = np.sum(np.diff(np.sign(jerk)) != 0) if len(jerk) > 1 else 0
    features['num_direction_changes'] = jerk_sign_changes
    
    # Method 4: Smoothness score (0-100, higher is better)
    # Combines low jerk, few peaks, and consistent movement
    # IMPROVED: More sensitive thresholds to detect jerky/uncontrolled movements
    
    # Jerk component: Use percentile-based or adaptive threshold
    # Typical controlled movement has normalized_jerk < 0.3
    # Jerky movement has normalized_jerk > 0.5
    jerk_threshold = 0.5  # More strict threshold
    jerk_component = max(0, 1 - (features['normalized_jerk'] / jerk_threshold))
    
    # Peaks component: Controlled movement should have 1-2 peaks per rep
    # More than 3-4 peaks indicates instability
    expected_peaks = 2  # A normal rep has ~2 main peaks (concentric + eccentric)
    excess_peaks = max(0, len(all_peaks) - expected_peaks)
    peaks_component = max(0, 1 - (excess_peaks / 5))  # Penalize heavily after 2+ extra peaks
    
    # Direction changes component: Controlled movement has smooth transitions
    # Calculate expected direction changes based on rep duration
    samples_per_rep = len(rep_data)
    # Expect ~1 direction change per 20-30 samples for smooth movement
    expected_changes = samples_per_rep / 25
    excess_changes = max(0, jerk_sign_changes - expected_changes)
    direction_component = max(0, 1 - (excess_changes / (samples_per_rep / 5)))
    
    # Jerk variability component (NEW): High std in jerk = inconsistent/shaky movement
    jerk_cv = features['jerk_std'] / (features['jerk_mean'] + 1e-6)  # Coefficient of variation
    jerk_variability_component = max(0, 1 - (jerk_cv / 3))  # Penalize high variability
    
    # Combined smoothness score with updated weights
    features['smoothness_score'] = (
        jerk_component * 0.35 +           # 35% weight on low jerk magnitude
        peaks_component * 0.25 +          # 25% weight on few peaks
        direction_component * 0.20 +      # 20% weight on consistent direction
        jerk_variability_component * 0.20 # 20% weight on jerk consistency (NEW)
    ) * 100
    
    # Store additional diagnostic metrics
    features['excess_peaks'] = excess_peaks
    features['jerk_variability'] = jerk_cv
    
    # Velocity metrics (for velocity loss calculation)
    # Calculate velocity from the primary movement axis signal
    velocity = np.cumsum(np.abs(primary_signal))  # Use primary axis instead of magnitude
    features['peak_velocity'] = np.max(np.abs(velocity))
    features['mean_velocity'] = np.mean(np.abs(velocity))
    
    # Mean propulsive velocity (average velocity during concentric phase)
    if transition_idx > 0:
        concentric_velocity = velocity[:transition_idx]
        features['mean_concentric_velocity'] = np.mean(np.abs(concentric_velocity))
    else:
        features['mean_concentric_velocity'] = 0
    
    # Store information about which axis was used for phase detection
    features['primary_movement_axis'] = primary_axis
    features['primary_axis_range'] = axis_ranges[primary_axis]
    features['peak_type'] = peak_type
    
    return features

# Extract features for each rep
feature_list = []
for rep_num in df['rep'].unique():
    rep_data = df[df['rep'] == rep_num]
    features = extract_features_per_rep(rep_data)
    features['rep'] = int(rep_num)
    
    # Add set information if available
    if 'set' in rep_data.columns:
        features['set'] = int(rep_data['set'].iloc[0])
    if 'rep_in_set' in rep_data.columns:
        features['rep_in_set'] = int(rep_data['rep_in_set'].iloc[0])
        
    feature_list.append(features)

# Create feature dataframe
features_df = pd.DataFrame(feature_list)

# Reorder columns to put 'set', 'rep', and 'rep_in_set' first
priority_cols = ['set', 'rep', 'rep_in_set']
first_cols = [col for col in priority_cols if col in features_df.columns]
remaining_cols = [col for col in features_df.columns if col not in first_cols]
features_df = features_df[first_cols + remaining_cols]

print(f"\n✓ Extracted {len(features_df.columns) - 1} features per rep")
print(f"✓ Total reps: {len(features_df)}")
print(f"\nFeature DataFrame shape: {features_df.shape}")
print(f"\nFeatures extracted:\n{features_df.columns.tolist()}")
print(f"\nFeature DataFrame (1 row per rep):\n{features_df}")

# Save features to CSV
features_df.to_csv('data/extracted_features.csv', index=False)
print("\n✓ Features saved to 'data/extracted_features.csv'")

# ==================== 3b. FATIGUE & VELOCITY LOSS ANALYSIS ====================
print("\n" + "=" * 60)
print("CALCULATING FATIGUE & VELOCITY LOSS")
print("=" * 60)

# Initialize columns for velocity loss and fatigue metrics
features_df['velocity_loss_percent'] = 0.0
features_df['peak_velocity_loss_percent'] = 0.0
features_df['velocity_loss_vs_previous'] = 0.0
features_df['fatigue_index'] = 0.0
features_df['performance_quality'] = 100.0

# First rep is the baseline
baseline_velocity = features_df['mean_concentric_velocity'].iloc[0]
baseline_peak_velocity = features_df['peak_velocity'].iloc[0]
baseline_duration = features_df['duration_ms'].iloc[0]
baseline_smoothness = features_df['smoothness_score'].iloc[0]
baseline_jerk = features_df['normalized_jerk'].iloc[0]

for i, idx in enumerate(features_df.index):
    # Velocity loss compared to first rep
    curr_velocity = features_df.loc[idx, 'mean_concentric_velocity']
    curr_peak_velocity = features_df.loc[idx, 'peak_velocity']
    
    if baseline_velocity > 0:
        features_df.loc[idx, 'velocity_loss_percent'] = ((baseline_velocity - curr_velocity) / baseline_velocity * 100)
    if baseline_peak_velocity > 0:
        features_df.loc[idx, 'peak_velocity_loss_percent'] = ((baseline_peak_velocity - curr_peak_velocity) / baseline_peak_velocity * 100)
    
    # Velocity loss compared to previous rep
    if i > 0:
        prev_idx = features_df.index[i - 1]
        prev_velocity = features_df.loc[prev_idx, 'mean_concentric_velocity']
        if prev_velocity > 0:
            features_df.loc[idx, 'velocity_loss_vs_previous'] = ((prev_velocity - curr_velocity) / prev_velocity * 100)
    
    # Fatigue index
    if i == 0:
        features_df.loc[idx, 'fatigue_index'] = 0  # First rep has no fatigue
    else:
        # Duration change from baseline
        duration_change = ((features_df.loc[idx, 'duration_ms'] - baseline_duration) / baseline_duration * 100) if baseline_duration > 0 else 0
        # Smoothness change from baseline
        smoothness_change = ((baseline_smoothness - features_df.loc[idx, 'smoothness_score']) / baseline_smoothness * 100) if baseline_smoothness != 0 else 0
        # Jerk increase from baseline
        jerk_increase = ((features_df.loc[idx, 'normalized_jerk'] - baseline_jerk) / baseline_jerk * 100) if baseline_jerk > 0 else 0
        
        features_df.loc[idx, 'fatigue_index'] = (
            features_df.loc[idx, 'velocity_loss_percent'] * 0.4 +  # 40% weight on velocity loss
            duration_change * 0.2 +  # 20% weight on duration increase
            smoothness_change * 0.2 +  # 20% weight on smoothness loss
            jerk_increase * 0.2  # 20% weight on jerk increase
        )

# Calculate performance quality
max_fatigue = features_df['fatigue_index'].max()
if max_fatigue > 0:
    for idx in features_df.index:
        fatigue_val = features_df.loc[idx, 'fatigue_index']
        features_df.loc[idx, 'performance_quality'] = 100 - (fatigue_val / max_fatigue * 100)

print(f"\n✓ Fatigue metrics calculated:")
print(f"  - First rep = baseline (0% velocity loss)")
print(f"  - Velocity Loss % (vs first rep)")
print(f"  - Peak Velocity Loss % (vs first rep)")
print(f"  - Velocity Loss % (vs previous rep)")
print(f"  - Fatigue Index (composite metric)")
print(f"  - Performance Quality Score (0-100)")

# Save updated features with fatigue metrics
features_df.to_csv('data/extracted_features.csv', index=False)
print("\n✓ Updated features with fatigue metrics saved to 'data/extracted_features.csv'")

# ==================== 4. PREPARE FOR MACHINE LEARNING ====================
print("\n" + "=" * 60)
print("PREPARING FOR MACHINE LEARNING - STANDARDIZATION")
print("=" * 60)

# Separate features from labels (drop rep identifier and non-numeric columns)
# Exclude string columns that can't be standardized
non_numeric_cols = ['rep', 'set', 'rep_in_set', 'primary_movement_axis', 'peak_type']
cols_to_drop = [col for col in non_numeric_cols if col in features_df.columns]
X = features_df.drop(cols_to_drop, axis=1)
y = features_df['rep']

print(f"\nOriginal Features (before standardization):")
print(f"Shape: {X.shape}")
print(f"\nSample statistics:\n{X.describe()}")

# Standardize features (mean=0, std=1)
scaler = StandardScaler()
X_standardized = scaler.fit_transform(X)
X_standardized_df = pd.DataFrame(X_standardized, columns=X.columns)
X_standardized_df.insert(0, 'rep', y.values)

print(f"\nStandardized Features (mean≈0, std≈1):")
print(f"Shape: {X_standardized_df.shape}")
print(f"\nStandardized Data:\n{X_standardized_df}")

# Save standardized data
X_standardized_df.to_csv('data/standardized_features.csv', index=False)
print("\n✓ Standardized features saved to 'data/standardized_features.csv'")

# ==================== 5. VISUALIZATIONS ====================
print("\n" + "=" * 60)
print("CREATING VISUALIZATIONS")
print("=" * 60)

# Visualization 1: Feature Comparison Across Reps
fig, axes = plt.subplots(4, 2, figsize=(16, 20))
fig.suptitle('Feature Comparison Across Reps', fontsize=16, fontweight='bold')

# LDLJ comparison
ldlj_cols = [col for col in features_df.columns if 'ldlj' in col]
features_df[ldlj_cols + ['rep']].set_index('rep').plot(kind='bar', ax=axes[0, 0])
axes[0, 0].set_title('Log-Dimensionless Jerk (LDLJ) Comparison')
axes[0, 0].set_xlabel('Rep')
axes[0, 0].set_ylabel('LDLJ Value')
axes[0, 0].legend(title='Metric', bbox_to_anchor=(1.05, 1), loc='upper left', fontsize=8)
axes[0, 0].grid(True, alpha=0.3)

# Range of Motion comparison
rom_cols = [col for col in features_df.columns if 'rom' in col]
features_df[rom_cols + ['rep']].set_index('rep').plot(kind='bar', ax=axes[0, 1])
axes[0, 1].set_title('Range of Motion (ROM) Comparison')
axes[0, 1].set_xlabel('Rep')
axes[0, 1].set_ylabel('ROM (degrees)')
axes[0, 1].legend(title='Angle', bbox_to_anchor=(1.05, 1), loc='upper left')
axes[0, 1].grid(True, alpha=0.3)

# Duration comparison (total, concentric, eccentric)
features_df.plot(x='rep', y=['duration_sec', 'concentric_duration_sec', 'eccentric_duration_sec'], 
                 kind='bar', ax=axes[1, 0])
axes[1, 0].set_title('Duration Breakdown by Phase\n(Concentric=Before Peak, Eccentric=After Peak)')
axes[1, 0].set_xlabel('Rep')
axes[1, 0].set_ylabel('Duration (seconds)')
axes[1, 0].legend(['Total Duration', 'Concentric (Before Peak)', 'Eccentric (After Peak)'])
axes[1, 0].grid(True, alpha=0.3)

# Concentric/Eccentric Ratio
features_df.plot(x='rep', y='concentric_eccentric_ratio', kind='bar', ax=axes[1, 1], 
                 color='coral', legend=False)
axes[1, 1].axhline(y=1.0, color='red', linestyle='--', linewidth=2, label='1:1 Ratio')
axes[1, 1].set_title('Concentric to Eccentric Ratio\n(Concentric/Eccentric Duration)')
axes[1, 1].set_xlabel('Rep')
axes[1, 1].set_ylabel('Ratio')
axes[1, 1].legend()
axes[1, 1].grid(True, alpha=0.3)

# Phase percentages
phase_data = features_df[['rep', 'concentric_percentage', 'eccentric_percentage']].set_index('rep')
phase_data.plot(kind='bar', stacked=True, ax=axes[2, 0], color=['#66b3ff', '#ff9999'])
axes[2, 0].set_title('Phase Distribution\n(Concentric=Before Peak, Eccentric=After Peak)')
axes[2, 0].set_xlabel('Rep')
axes[2, 0].set_ylabel('Percentage (%)')
axes[2, 0].set_ylim(0, 100)
axes[2, 0].legend(['Concentric (Before Peak) %', 'Eccentric (After Peak) %'])
axes[2, 0].grid(True, alpha=0.3)

# Acceleration statistics
accel_cols = ['accel_mean', 'accel_max', 'filtered_mean', 'filtered_max']
features_df[accel_cols + ['rep']].set_index('rep').plot(kind='line', marker='o', ax=axes[2, 1])
axes[2, 1].set_title('Acceleration Metrics Across Reps')
axes[2, 1].set_xlabel('Rep')
axes[2, 1].set_ylabel('Acceleration')
axes[2, 1].legend(bbox_to_anchor=(1.05, 1), loc='upper left')
axes[2, 1].grid(True, alpha=0.3)

# Velocity Loss visualization
ax_vel = axes[3, 0]
x_reps = range(len(features_df))
x_labels = features_df['rep'].values
ax_vel.plot(x_reps, features_df['velocity_loss_percent'], marker='o', linewidth=2, 
            markersize=8, label='Velocity Loss vs First Rep', color='red')
ax_vel.fill_between(x_reps, 0, features_df['velocity_loss_percent'], alpha=0.3, color='red')
ax_vel.axhline(y=0, color='green', linestyle='--', linewidth=1, label='Baseline (First Rep)')
ax_vel.axhline(y=10, color='orange', linestyle='--', linewidth=1, label='10% Threshold')
ax_vel.set_title('Velocity Loss Across Reps\n(Compared to First Rep)')
ax_vel.set_xlabel('Rep')
ax_vel.set_ylabel('Velocity Loss (%)')
ax_vel.set_xticks(x_reps)
ax_vel.set_xticklabels(x_labels, rotation=45)
ax_vel.legend()
ax_vel.grid(True, alpha=0.3)

# Fatigue Index & Performance Quality
ax_fatigue = axes[3, 1]
ax_fatigue_twin = ax_fatigue.twinx()
line1 = ax_fatigue.plot(x_reps, features_df['fatigue_index'], marker='s', linewidth=2, 
                        markersize=8, label='Fatigue Index', color='darkred')
line2 = ax_fatigue_twin.plot(x_reps, features_df['performance_quality'], marker='o', linewidth=2, 
                             markersize=8, label='Performance Quality', color='green')
ax_fatigue.set_title('Fatigue Index & Performance Quality Across Reps')
ax_fatigue.set_xlabel('Rep')
ax_fatigue.set_ylabel('Fatigue Index', color='darkred')
ax_fatigue_twin.set_ylabel('Performance Quality (0-100)', color='green')
ax_fatigue.set_xticks(x_reps)
ax_fatigue.set_xticklabels(x_labels, rotation=45)
ax_fatigue.tick_params(axis='y', labelcolor='darkred')
ax_fatigue_twin.tick_params(axis='y', labelcolor='green')
lines = line1 + line2
labels = [l.get_label() for l in lines]
ax_fatigue.legend(lines, labels, loc='upper left')
ax_fatigue.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(VIZ_DIR / 'feature_comparison.png', dpi=300, bbox_inches='tight')
print(f"✓ Feature comparison saved to '{VIZ_DIR}'")
plt.show()

# Visualization 2: Correlation Heatmap
fig, ax = plt.subplots(figsize=(14, 12))
correlation_matrix = X.corr()
sns.heatmap(correlation_matrix, annot=False, cmap='coolwarm', center=0, 
            square=True, linewidths=0.5, cbar_kws={"shrink": 0.8}, ax=ax)
ax.set_title('Feature Correlation Heatmap', fontsize=16, fontweight='bold', pad=20)
plt.tight_layout()
plt.savefig(VIZ_DIR / 'correlation_heatmap.png', dpi=300, bbox_inches='tight')
print(f"✓ Correlation heatmap saved to '{VIZ_DIR}'")
plt.show()

# Visualization 3: Distribution of Standardized Features
fig, axes = plt.subplots(3, 3, figsize=(16, 12))
fig.suptitle('Distribution of Key Standardized Features', fontsize=16, fontweight='bold')
axes = axes.flatten()

key_features = ['ldlj_accelMag', 'rom_roll', 'rom_pitch', 'accel_mean', 
                'filtered_mean', 'gyro_y_max', 'duration_ms', 'num_peaks', 'smoothness_score']

for idx, feature in enumerate(key_features):
    if idx < len(axes):
        # Box plot
        axes[idx].boxplot(X_standardized_df[feature], vert=True)
        axes[idx].scatter(np.ones(len(X_standardized_df)) + np.random.normal(0, 0.02, len(X_standardized_df)), 
                         X_standardized_df[feature], alpha=0.6, s=80)
        axes[idx].set_title(feature, fontweight='bold')
        axes[idx].set_ylabel('Standardized Value')
        axes[idx].grid(True, alpha=0.3)
        axes[idx].set_xticks([])

plt.tight_layout()
plt.savefig(VIZ_DIR / 'feature_distributions.png', dpi=300, bbox_inches='tight')
print(f"✓ Feature distributions saved to '{VIZ_DIR}'")
plt.show()

# Visualization 4: Rep Quality Comparison
fig, ax = plt.subplots(figsize=(12, 8))
rep_labels = features_df['rep'].values

# Create a quality score (0-100 scale, based on smoothness and duration consistency)
mean_duration = features_df['duration_ms'].mean()
duration_consistency = 1 - np.clip(np.abs(features_df['duration_ms'] - mean_duration) / mean_duration, 0, 1)

# Combined quality score (0-100)
quality_score = (
    (features_df['smoothness_score'] / 100) * 0.7 +  # 70% smoothness
    duration_consistency * 0.3                         # 30% duration consistency
) * 100

# Ensure quality_score is bounded 0-100
quality_score = np.clip(quality_score, 0, 100)

# Color based on quality (green=good, red=bad)
colors = plt.cm.RdYlGn(quality_score / 100)
bars = ax.bar(range(len(rep_labels)), quality_score, color=colors, edgecolor='black', linewidth=1.5)
ax.set_xlabel('Rep', fontsize=12, fontweight='bold')
ax.set_ylabel('Quality Score (0-100)', fontsize=12, fontweight='bold')
ax.set_title('Rep Quality Comparison\n(Based on Smoothness Score & Duration Consistency)', 
             fontsize=14, fontweight='bold')
ax.set_xticks(range(len(rep_labels)))
ax.set_xticklabels(rep_labels, rotation=45)
ax.set_ylim(0, 105)  # Set y-axis to 0-100 scale
ax.axhline(y=80, color='green', linestyle='--', linewidth=1, alpha=0.7, label='Good (>80)')
ax.axhline(y=60, color='orange', linestyle='--', linewidth=1, alpha=0.7, label='Fair (>60)')
ax.axhline(y=40, color='red', linestyle='--', linewidth=1, alpha=0.7, label='Poor (<40)')
ax.legend(loc='upper right')
ax.grid(True, alpha=0.3, axis='y')

# Add value labels on bars
for bar, score in zip(bars, quality_score):
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height,
            f'{score:.3f}', ha='center', va='bottom', fontweight='bold')

plt.tight_layout()
plt.savefig(VIZ_DIR / 'rep_quality_comparison.png', dpi=300, bbox_inches='tight')
print(f"✓ Rep quality comparison saved to '{VIZ_DIR}'")
plt.show()

# Visualization 5: Fatigue & Velocity Loss Analysis
fig, axes = plt.subplots(3, 2, figsize=(16, 16))
fig.suptitle('Fatigue, Velocity Loss & Movement Quality Analysis', fontsize=16, fontweight='bold')

x_idx = range(len(features_df))
x_labels = features_df['rep'].values

# 1. Velocity metrics over reps
axes[0, 0].plot(x_idx, features_df['peak_velocity'], marker='o', 
                linewidth=2, markersize=8, label='Peak Velocity', color='blue')
axes[0, 0].plot(x_idx, features_df['mean_concentric_velocity'], marker='s', 
                linewidth=2, markersize=8, label='Mean Concentric Velocity', color='green')
axes[0, 0].set_title('Velocity Metrics Across Reps')
axes[0, 0].set_xlabel('Rep')
axes[0, 0].set_ylabel('Velocity (arbitrary units)')
axes[0, 0].set_xticks(x_idx)
axes[0, 0].set_xticklabels(x_labels, rotation=45)
axes[0, 0].legend()
axes[0, 0].grid(True, alpha=0.3)

# 2. Smoothness Score (0-100, higher is better)
colors_smooth = plt.cm.RdYlGn(features_df['smoothness_score'] / 100)
bars = axes[0, 1].bar(x_idx, features_df['smoothness_score'], 
                       color=colors_smooth, edgecolor='black', linewidth=1.5)
axes[0, 1].axhline(y=80, color='green', linestyle='--', linewidth=1, alpha=0.7, label='Excellent (>80)')
axes[0, 1].axhline(y=60, color='orange', linestyle='--', linewidth=1, alpha=0.7, label='Good (>60)')
axes[0, 1].set_title('Movement Smoothness Score\n(0-100, Higher = Smoother)')
axes[0, 1].set_xlabel('Rep')
axes[0, 1].set_ylabel('Smoothness Score')
axes[0, 1].set_ylim(0, 105)
axes[0, 1].set_xticks(x_idx)
axes[0, 1].set_xticklabels(x_labels, rotation=45)
axes[0, 1].legend()
axes[0, 1].grid(True, alpha=0.3, axis='y')
for bar, score in zip(bars, features_df['smoothness_score']):
    height = bar.get_height()
    axes[0, 1].text(bar.get_x() + bar.get_width()/2., height,
                    f'{score:.1f}', ha='center', va='bottom', fontweight='bold', fontsize=9)

# 3. Normalized Jerk (lower is smoother)
axes[1, 0].plot(x_idx, features_df['normalized_jerk'], marker='d', 
                linewidth=2, markersize=8, color='purple', label='Normalized Jerk')
axes[1, 0].fill_between(x_idx, 0, features_df['normalized_jerk'], alpha=0.3, color='purple')
axes[1, 0].set_title('Normalized Jerk Across Reps\n(Lower = Smoother Movement)')
axes[1, 0].set_xlabel('Rep')
axes[1, 0].set_ylabel('Normalized Jerk')
axes[1, 0].set_xticks(x_idx)
axes[1, 0].set_xticklabels(x_labels, rotation=45)
axes[1, 0].legend()
axes[1, 0].grid(True, alpha=0.3)

# 4. Velocity loss comparison
width = 0.35
x_pos = np.arange(len(features_df))
axes[1, 1].bar(x_pos - width/2, features_df['velocity_loss_percent'], width, 
               label='vs First Rep', color='coral', alpha=0.8)
axes[1, 1].bar(x_pos + width/2, features_df['velocity_loss_vs_previous'], width, 
               label='vs Previous Rep', color='lightblue', alpha=0.8)
axes[1, 1].axhline(y=0, color='black', linestyle='-', linewidth=0.8)
axes[1, 1].axhline(y=10, color='orange', linestyle='--', linewidth=1, label='10% Threshold')
axes[1, 1].axhline(y=20, color='red', linestyle='--', linewidth=1, label='20% Threshold')
axes[1, 1].set_title('Velocity Loss Comparison')
axes[1, 1].set_xlabel('Rep')
axes[1, 1].set_ylabel('Velocity Loss (%)')
axes[1, 1].set_xticks(x_pos)
axes[1, 1].set_xticklabels(x_labels, rotation=45)
axes[1, 1].legend()
axes[1, 1].grid(True, alpha=0.3, axis='y')

# 5. Fatigue progression
colors_fatigue = plt.cm.RdYlGn_r(features_df['fatigue_index'] / features_df['fatigue_index'].max() 
                                  if features_df['fatigue_index'].max() > 0 else [0]*len(features_df))
bars = axes[2, 0].bar(x_idx, features_df['fatigue_index'], 
                       color=colors_fatigue, edgecolor='black', linewidth=1.5)
axes[2, 0].set_title('Fatigue Index Progression\n(Higher = More Fatigued)')
axes[2, 0].set_xlabel('Rep')
axes[2, 0].set_ylabel('Fatigue Index')
axes[2, 0].set_xticks(x_idx)
axes[2, 0].set_xticklabels(x_labels, rotation=45)
axes[2, 0].grid(True, alpha=0.3, axis='y')

# Add value labels on bars
for bar, fatigue in zip(bars, features_df['fatigue_index']):
    height = bar.get_height()
    axes[2, 0].text(bar.get_x() + bar.get_width()/2., height,
                    f'{fatigue:.1f}', ha='center', va='bottom', fontweight='bold')

# 6. Performance quality score
colors_perf = plt.cm.RdYlGn(features_df['performance_quality'] / 100)
bars = axes[2, 1].bar(x_idx, features_df['performance_quality'], 
                       color=colors_perf, edgecolor='black', linewidth=1.5)
axes[2, 1].axhline(y=80, color='green', linestyle='--', linewidth=1, alpha=0.7, label='Good (>80)')
axes[2, 1].axhline(y=60, color='orange', linestyle='--', linewidth=1, alpha=0.7, label='Fair (>60)')
axes[2, 1].set_title('Performance Quality Score\n(100 = Best Performance)')
axes[2, 1].set_xlabel('Rep')
axes[2, 1].set_ylabel('Quality Score (0-100)')
axes[2, 1].set_ylim(0, 105)
axes[2, 1].set_xticks(x_idx)
axes[2, 1].set_xticklabels(x_labels, rotation=45)
axes[2, 1].legend()
axes[2, 1].grid(True, alpha=0.3, axis='y')

# Add value labels on bars
for bar, quality in zip(bars, features_df['performance_quality']):
    height = bar.get_height()
    axes[2, 1].text(bar.get_x() + bar.get_width()/2., height,
                    f'{quality:.1f}', ha='center', va='bottom', fontweight='bold')

plt.tight_layout()
plt.savefig(VIZ_DIR / 'fatigue_velocity_analysis.png', dpi=300, bbox_inches='tight')
print(f"✓ Fatigue & velocity loss analysis saved to '{VIZ_DIR}'")
plt.show()

# ==================== SUMMARY ====================
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"✓ Data File: {data_file}")
print(f"✓ Loaded data: {df.shape[0]} samples, {df.shape[1]} columns")

# Show set and rep breakdown in summary
if 'set' in features_df.columns:
    num_sets = features_df['set'].nunique()
    num_reps = len(features_df)
    print(f"✓ Number of sets: {num_sets}")
    print(f"✓ Total reps across all sets: {num_reps}")
    
    # Show reps per set
    set_rep_counts = features_df.groupby('set').size()
    for set_num, rep_count in set_rep_counts.items():
        print(f"  Set {set_num}: {rep_count} reps")
else:
    print(f"✓ Number of reps: {len(features_df)}")

print(f"✓ Features extracted per rep: {len(features_df.columns) - len([col for col in ['set', 'rep', 'rep_in_set'] if col in features_df.columns])}")
print(f"✓ Final dataset: {features_df.shape[0]} rows (1 per rep), {features_df.shape[1]} columns")

print("\n" + "=" * 60)
print("RANGE OF MOTION (ROM) IN DEGREES - PER REP")
print("=" * 60)
for idx, row in features_df.iterrows():
    set_info = f" (Set {int(row['set'])}, Rep {int(row['rep_in_set'])})" if 'set' in row and 'rep_in_set' in row else ""
    print(f"\nRep {int(row['rep'])}{set_info}:")
    print(f"  Roll ROM:  {row['rom_roll']:.2f}°")
    print(f"  Pitch ROM: {row['rom_pitch']:.2f}°")
    print(f"  Yaw ROM:   {row['rom_yaw']:.2f}°")

print("\n" + "=" * 60)
print("TEMPORAL PATTERNS (CONCENTRIC vs ECCENTRIC) - PER REP")
print("=" * 60)
print("NEW: Using PRIMARY MOVEMENT AXIS for phase detection (more accurate)")
print("Concentric = Time BEFORE peak (lifting/pushing phase)")
print("Eccentric = Time AFTER peak (lowering/returning phase)")
print("Primary axis = axis with highest range of motion (X, Y, or Z)")
print("-" * 60)
for idx, row in features_df.iterrows():
    primary_axis_info = f" [Primary: {row.get('primary_movement_axis', 'N/A')} axis]" if 'primary_movement_axis' in row else ""
    peak_type_info = f" [{row.get('peak_type', 'N/A')} peak]" if 'peak_type' in row else ""
    set_info = f" (Set {int(row['set'])}, Rep {int(row['rep_in_set'])})" if 'set' in row and 'rep_in_set' in row else ""
    print(f"\nRep {int(row['rep'])}{set_info}:{primary_axis_info}{peak_type_info}")
    print(f"  Total Duration:      {row['duration_sec']:.3f}s ({row['duration_ms']:.0f}ms)")
    print(f"  Concentric (before): {row['concentric_duration_sec']:.3f}s ({row['concentric_duration_ms']:.0f}ms) - {row['concentric_percentage']:.1f}%")
    print(f"  Eccentric (after):   {row['eccentric_duration_sec']:.3f}s ({row['eccentric_duration_ms']:.0f}ms) - {row['eccentric_percentage']:.1f}%")
    print(f"  Concentric/Eccentric Ratio: {row['concentric_eccentric_ratio']:.3f}")
    print(f"  Peak occurs at:      {row['peak_time_percentage']:.1f}% of rep duration")

print("\n" + "=" * 60)
print("FATIGUE & VELOCITY LOSS ANALYSIS - PER REP")
print("=" * 60)
print("⚡ First rep = baseline (0% velocity loss)")
print("-" * 60)

for idx, row in features_df.iterrows():
    is_baseline = row['rep'] == features_df['rep'].iloc[0]
    baseline_marker = " ⭐ BASELINE" if is_baseline else ""
    set_info = f" (Set {int(row['set'])}, Rep {int(row['rep_in_set'])})" if 'set' in row and 'rep_in_set' in row else ""
    print(f"\nRep {int(row['rep'])}{set_info}{baseline_marker}:")
    print(f"  Peak Velocity:           {row['peak_velocity']:.2f}")
    print(f"  Mean Concentric Velocity: {row['mean_concentric_velocity']:.2f}")
    print(f"  Velocity Loss (vs 1st):  {row['velocity_loss_percent']:.2f}%")
    print(f"  Velocity Loss (vs prev): {row['velocity_loss_vs_previous']:.2f}%")
    print(f"  Smoothness Score:        {row['smoothness_score']:.1f}/100")
    print(f"  Normalized Jerk:         {row['normalized_jerk']:.4f} (lower is smoother)")
    print(f"  Direction Changes:       {int(row['num_direction_changes'])}")
    print(f"  Fatigue Index:           {row['fatigue_index']:.2f}")
    print(f"  Performance Quality:     {row['performance_quality']:.1f}/100")
    
    # Add warnings
    warnings_list = []
    if row['velocity_loss_percent'] > 20:
        warnings_list.append("⚠️  High velocity loss (>20%)")
    elif row['velocity_loss_percent'] > 10:
        warnings_list.append("⚡ Moderate velocity loss (>10%)")
    
    if row['smoothness_score'] < 60:
        warnings_list.append("⚠️  Low smoothness - jerky movement")
    elif row['smoothness_score'] < 70:
        warnings_list.append("⚡ Reduced smoothness")
    
    if row['performance_quality'] < 60:
        warnings_list.append("⚠️  Low performance quality")
    
    if warnings_list:
        for warning in warnings_list:
            print(f"  {warning}")

print(f"\n✓ Files created:")
print(f"  - extracted_features.csv (raw features)")
print(f"  - standardized_features.csv (standardized for ML)")
print(f"  - segmentation_visualization.png")
print(f"  - feature_comparison.png")
print(f"  - correlation_heatmap.png")
print(f"  - feature_distributions.png")
print(f"  - rep_quality_comparison.png")
print(f"  - fatigue_velocity_analysis.png")

print("\n" + "=" * 60)
print("KEY INSIGHTS")
print("=" * 60)

avg_velocity_loss = features_df['velocity_loss_percent'].mean()
max_velocity_loss = features_df['velocity_loss_percent'].max()
avg_smoothness = features_df['smoothness_score'].mean()
final_fatigue = features_df['fatigue_index'].iloc[-1]
total_reps = len(features_df)

# Find max loss rep
max_loss_idx = features_df['velocity_loss_percent'].idxmax()
max_loss_rep = features_df.loc[max_loss_idx, 'rep']

print(f"\n📊 WORKOUT SUMMARY:")
print(f"  ✓ Total reps: {total_reps}")
print(f"  ✓ Avg velocity loss: {avg_velocity_loss:.2f}%")
print(f"  ✓ Max velocity loss: {max_velocity_loss:.2f}% (Rep {int(max_loss_rep)})")
print(f"  ✓ Final fatigue index: {final_fatigue:.2f}")
print(f"  ✓ Avg smoothness: {avg_smoothness:.1f}/100")

# Overall assessment
print("\n📊 OVERALL ASSESSMENT:")
if max_velocity_loss > 20:
    print(f"  ⚠️  HIGH FATIGUE DETECTED: Consider reducing volume")
elif max_velocity_loss > 10:
    print(f"  ⚡ MODERATE FATIGUE: Monitor for further degradation")
else:
    print(f"  ✅ GOOD PERFORMANCE: Velocity well maintained")

if avg_smoothness >= 80:
    print(f"  ✅ EXCELLENT movement quality")
elif avg_smoothness >= 70:
    print(f"  ✅ GOOD movement quality")
elif avg_smoothness >= 60:
    print(f"  ⚡ FAIR movement quality")
else:
    print(f"  ⚠️  POOR movement quality - consider form correction")

print("\n✓ Data is ready for machine learning!")
print("=" * 60)
