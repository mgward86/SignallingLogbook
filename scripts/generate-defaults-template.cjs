// One-off script: generates Default_Config_Template.xlsx summarizing every
// "database" (Firestore config/main list + coded fallback default) in the
// app, pre-filled with current values, for the user to edit and hand back.
// Not part of the app build - safe to delete after use.
const XLSX = require('xlsx');
const path = require('path');

function htmlToPlainText(html) {
  return html
    .replace(/<li>/g, '\n- ')
    .replace(/<\/li>/g, '')
    .replace(/<\/p>/g, '\n')
    .replace(/<p>/g, '')
    .replace(/<strong>/g, '')
    .replace(/<\/strong>/g, '')
    .replace(/<ul>|<\/ul>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// --- Current coded defaults (from src/constants.ts + src/hooks/useConfig.ts) ---

const EQUIPMENT_CATEGORIES = [
  { name: 'Signals & Indicators', subCategories: ['Multi-Aspect Colour Light', 'LED Running Signal', 'Ground Shunt & Subsidiary', 'Route Indicator (Theatre/Stencil)', 'Route Indicator (Directional/Row of Lights)', 'Buffer Stop Lights (LED)', 'Co-acting Signal'] },
  { name: 'Points & Turnout Systems', subCategories: ['Electro-Pneumatic (EP) Machine', 'Electric Machine (Westinghouse M23A)', 'Electric Machine (Siemens M3/Style 84)', 'In-Bearer Point Machine', 'Claw Lock / Sphero-Lock Mech', 'Mechanical Ground Frame', 'ESML / EOL (Emergency Lock)'] },
  { name: 'Track Detection Systems', subCategories: ['TI21 Audio Frequency Jointless', 'HVI (High Voltage Impulse)', 'AC 50Hz Double/Single Rail', 'Axle Counter (Frauscher/Thales)', 'DC Track Circuit', 'Jeumont-Schneider Impulse'] },
  { name: 'Train Protection Systems', subCategories: ['EP Mechanical Train Stop', 'Electric Train Stop', 'ETCS Level 1 Balise', 'ETCS LEU (Lineside Electronic Unit)', 'TPWS Transmitter/Antenna', 'AWS Track Equipment'] },
  { name: 'Interlocking & Control Systems', subCategories: ['Microlok II CBI', 'Westrace (CBI)', 'Solid State Interlocking (SSI)', 'Q-Style Plug-In Relays', 'Shelf-Type Relay Interlocking', 'ATRICS / Phoenix Control System'] },
  { name: 'Power Supplies & Distribution', subCategories: ['120V AC Main Signalling Supply', 'Signalling UPS System', 'Battery Bank & Charger Array', 'Transformer & Isolation Panel', 'Diesel Backup Generator / AMF', 'Points Air Compressor Plant'] },
  { name: 'Level Crossings & Warning Systems', subCategories: ['Boom Gate Mechanism (Type W)', 'Flashing Light Assembly & Bells', 'Pedestrian Swing/Slide Gates', 'Level Crossing Monitor (LXM)', 'Cerberus / LC Telemetry System'] },
  { name: 'Wayside Monitoring & Alarms', subCategories: ['Wheel Impact Load Detector (WILD)', 'Hot Bearing / Hot Wheel (HBD/HWD)', 'Dragging Equipment Detector (DED)', 'Points Condition Monitor (PCM)', 'Landslide / Rockfall Detector', 'Track Circuit Monitor (TCM)'] },
  { name: 'Enclosures & Environs', subCategories: ['CER (Central Equipment Room)', 'SER (Signalling Equipment Room)', 'Relay House / REB', 'Location Case (Loc)', 'Cable Pit & GLD Troughing'] },
];

const WORK_TYPES = [
  'Routine Preventative Maintenance (PM)',
  'Corrective Maintenance & Repair (RM)',
  'Signalling Certification & Handover',
  'Joint Range & Test (SOP-01)',
  'Point Machine Cleaning, Lubrication & Gauge Check',
  'Track Circuit Shunt & Voltage Testing',
  'Signal Aspect, Focus & Visibility Check',
  'Level Crossing Functional Testing (SOP-03)',
  'New Works Installation & Commissioning',
  'Emergency Fault Rectification & Incident Response',
  'Pre-arranged System Testing / Inspection',
];

const DEFAULT_QUICK_PARTS = [
  { title: 'New Works & Commissioning Scope', shortLabel: 'Commissioning', category: 'Testing & Commissioning', suggestedWorkType: 'New Works Installation & Commissioning', descriptionHtml: `<p><strong>Commissioning Scope:</strong> Final field configuration changes and commissioning of signalling equipment.</p><p><strong>Carried out the following activities:</strong></p><ul><li>Audit Construction Documentation &amp; Circuit Books</li><li>Perform Signal Sighting, Alignment, and Focus Verification</li><li>Execute Wire Count &amp; Bell Correlation Checks</li><li>Prepare / Review Inspection &amp; Test Plan (ITP)</li><li>Joint Range &amp; Test Verification with Network Control</li></ul>` },
  { title: 'Routine Preventative Maintenance (PM)', shortLabel: 'Routine PM', category: 'Maintenance', suggestedWorkType: 'Routine Preventative Maintenance (PM)', descriptionHtml: `<p><strong>Routine Maintenance Scope:</strong> Conducted periodic inspection, cleaning, and operational testing.</p><p><strong>Completed activities:</strong></p><ul><li>Inspected point machine locks, clearances, and mechanical drive rod lubrication</li><li>Measured track circuit feed/relay voltages and drop-out/pick-up parameters</li><li>Cleaned signal lenses and verified aspect indication LEDs</li><li>Checked backup UPS battery voltages and power supply isolation</li></ul>` },
  { title: 'Fault Investigation & Rectification', shortLabel: 'Fault Investigation', category: 'Corrective', suggestedWorkType: 'Emergency Fault Rectification & Incident Response', descriptionHtml: `<p><strong>Fault Response:</strong> Attended site following signal failure/alarm notification.</p><p><strong>Investigation &amp; Rectification:</strong></p><ul><li>Diagnosed root cause using telemetry logs and multimeter measurements</li><li>Replaced faulty plug-in relay / damaged wiring loom</li><li>Performed functional test &amp; full route correspondence check</li><li>Restored equipment to full operational status with Signalling Tester sign-off</li></ul>` },
  { title: 'Level Crossing Safety Audit & Testing', shortLabel: 'Level Crossing Test', category: 'Testing & Commissioning', suggestedWorkType: 'Level Crossing Functional Testing (SOP-03)', descriptionHtml: `<p><strong>Level Crossing Test Scope:</strong> Performed monthly functional and safety audit of level crossing protection.</p><p><strong>Testing Performed:</strong></p><ul><li>Tested boom gate operation time, drop time, and warning bells</li><li>Verified pedestrian gate interlocks and emergency manual release</li><li>Checked battery charger float voltage and standby power fail-over</li><li>Completed LXM event log review and updated site maintenance book</li></ul>` },
  { title: 'Point Machine Inspection & Gauge Check', shortLabel: 'Points & Gauge', category: 'Maintenance', suggestedWorkType: 'Point Machine Cleaning, Lubrication & Gauge Check', descriptionHtml: `<p><strong>Points Maintenance Scope:</strong> Conducted mechanical drive, lock, and detection inspection.</p><p><strong>Executed Tasks:</strong></p><ul><li>Checked 3.5mm obstruction test on normal and reverse points</li><li>Inspected claw lock / detector slide wear and lubrication</li><li>Measured motor operating current and throw time under load</li><li>Verified emergency crank handle cut-out switch operation</li></ul>` },
  { title: 'Track Circuit Shunt & Voltage Testing', shortLabel: 'Track Circuit Shunt', category: 'Testing & Commissioning', suggestedWorkType: 'Track Circuit Shunt & Voltage Testing', descriptionHtml: `<p><strong>Track Circuit Scope:</strong> Carried out shunt testing and parameter validation.</p><p><strong>Executed Activities:</strong></p><ul><li>Measured feed and relay end AC/DC operating voltages</li><li>Verified 0.5 ohm fixed shunt resistance drop-out across all rail bonds</li><li>Inspected impedance bonds, fishplates, and insulation joints</li><li>Updated site test record card and logged reference values</li></ul>` },
];

const DEFAULT_SUPERVISORS = [
  { name: 'David Miller', riwNumber: '8839210', title: 'Senior Signal Engineer', email: '' },
  { name: 'Sarah Jenkins', riwNumber: '7721094', title: 'Commissioning Manager', email: '' },
  { name: 'Michael Chang', riwNumber: '9940123', title: 'Signals Maintenance Supervisor', email: '' },
];

// Flat list defaults - only "clients" is currently seeded; the rest ship empty.
const CLIENTS = ['Network Rail', 'UGL', 'Rhomberg'];
const EMPLOYERS = [];
const INFRASTRUCTURE_OWNERS = [];
const ROLES = [];
const LOCATIONS = [];
const PROJECTS = [];

// --- Build workbook ---
const wb = XLSX.utils.book_new();

function addSheet(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
  return ws;
}

// 1. Read Me
const readMeRows = [
  { 'Railway Signalling Logbook - Default Config Template': '' },
  { 'Railway Signalling Logbook - Default Config Template': 'This workbook lists every shared dropdown/list ("database") used across the app, pre-filled with the current defaults coded into the app.' },
  { 'Railway Signalling Logbook - Default Config Template': 'Edit any sheet: add rows, remove rows, reorder, or change text. Leave a sheet as-is to keep it unchanged.' },
  { 'Railway Signalling Logbook - Default Config Template': 'These lists are shared org-wide (Firestore config/main) - they are not per-user, but this is what any brand-new deployment/org will see pre-populated with.' },
  { 'Railway Signalling Logbook - Default Config Template': 'When done, send this file back and it will be used to update src/constants.ts and src/hooks/useConfig.ts.' },
  { 'Railway Signalling Logbook - Default Config Template': '' },
  { 'Railway Signalling Logbook - Default Config Template': 'Sheets:' },
  { 'Railway Signalling Logbook - Default Config Template': '- Equipment Categories: Category Name + Sub-Category, one sub-category per row, grouped by category.' },
  { 'Railway Signalling Logbook - Default Config Template': '- Work Types: one work type per row.' },
  { 'Railway Signalling Logbook - Default Config Template': '- Quick Parts: pre-built activity templates offered when creating a log entry. Description column uses "- " for bullet points.' },
  { 'Railway Signalling Logbook - Default Config Template': '- Approving Supervisors: default supervisor list offered for sign-off.' },
  { 'Railway Signalling Logbook - Default Config Template': '- Simple Lists: Clients / Employers / Infrastructure Owners / Roles / Locations / Projects - independent columns, currently mostly empty (admins add these via the in-app Config Manager over time; only Clients ships with 3 defaults).' },
  { 'Railway Signalling Logbook - Default Config Template': '- Settings: Log numbering prefix/start number and quarter format.' },
];
const readMeWs = XLSX.utils.json_to_sheet(readMeRows, { skipHeader: true });
XLSX.utils.book_append_sheet(wb, readMeWs, 'Read Me');

// 2. Equipment Categories
const categoryRows = [];
for (const cat of EQUIPMENT_CATEGORIES) {
  for (const sub of cat.subCategories) {
    categoryRows.push({ 'Category Name': cat.name, 'Sub-Category': sub });
  }
}
addSheet('Equipment Categories', categoryRows);

// 3. Work Types
addSheet('Work Types', WORK_TYPES.map(w => ({ 'Work Type': w })));

// 4. Quick Parts
addSheet('Quick Parts', DEFAULT_QUICK_PARTS.map(qp => ({
  'Title': qp.title,
  'Short Label': qp.shortLabel,
  'Category': qp.category,
  'Suggested Work Type': qp.suggestedWorkType,
  'Description (use "- " per bullet, new line per bullet)': htmlToPlainText(qp.descriptionHtml),
})));

// 5. Approving Supervisors
addSheet('Approving Supervisors', DEFAULT_SUPERVISORS.map(s => ({
  'Name': s.name,
  'RIW Number': s.riwNumber,
  'Title': s.title,
  'Email (optional)': s.email,
})));

// 6. Simple Lists (independent columns, padded to equal length)
const simpleLists = { Clients: CLIENTS, Employers: EMPLOYERS, 'Infrastructure Owners': INFRASTRUCTURE_OWNERS, Roles: ROLES, Locations: LOCATIONS, Projects: PROJECTS };
const maxLen = Math.max(...Object.values(simpleLists).map(l => l.length), 1);
const simpleRows = [];
for (let i = 0; i < maxLen; i++) {
  const row = {};
  for (const [key, list] of Object.entries(simpleLists)) {
    row[key] = list[i] || '';
  }
  simpleRows.push(row);
}
addSheet('Simple Lists', simpleRows);

// 7. Settings
addSheet('Settings', [
  { 'Setting': 'Log Number Prefix', 'Value': 'LOG-', 'Notes': 'Prepended to each auto-generated log number, e.g. LOG-1' },
  { 'Setting': 'Log Number Starts At', 'Value': 1, 'Notes': 'First number used for auto-numbering' },
  { 'Setting': 'Auto-Numbering Enabled', 'Value': 'TRUE', 'Notes': 'TRUE or FALSE' },
  { 'Setting': 'Quarter Format', 'Value': 'Q1-Q4', 'Notes': 'Either "Q1-Q4" or "Months"' },
]);

const outPath = path.join(__dirname, '..', 'Default_Config_Template.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
