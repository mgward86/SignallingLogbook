export const EQUIPMENT_CATEGORIES = [
  {
    id: 'signals',
    name: 'Signals & Indicators',
    subCategories: [
      'Multi-Aspect Colour Light',
      'LED Running Signal',
      'Ground Shunt & Subsidiary',
      'Route Indicator (Theatre/Stencil)',
      'Route Indicator (Directional/Row of Lights)',
      'Buffer Stop Lights (LED)',
      'Co-acting Signal'
    ]
  },
  {
    id: 'points',
    name: 'Points & Turnout Systems',
    subCategories: [
      'Electro-Pneumatic (EP) Machine',
      'Electric Machine (Westinghouse M23A)',
      'Electric Machine (Siemens M3/Style 84)',
      'In-Bearer Point Machine',
      'Claw Lock / Sphero-Lock Mech',
      'Mechanical Ground Frame',
      'ESML / EOL (Emergency Lock)'
    ]
  },
  {
    id: 'track-detection',
    name: 'Track Detection Systems',
    subCategories: [
      'TI21 Audio Frequency Jointless',
      'HVI (High Voltage Impulse)',
      'AC 50Hz Double/Single Rail',
      'Axle Counter (Frauscher/Thales)',
      'DC Track Circuit',
      'Jeumont-Schneider Impulse'
    ]
  },
  {
    id: 'train-protection',
    name: 'Train Protection Systems',
    subCategories: [
      'EP Mechanical Train Stop',
      'Electric Train Stop',
      'ETCS Level 1 Balise',
      'ETCS LEU (Lineside Electronic Unit)',
      'TPWS Transmitter/Antenna',
      'AWS Track Equipment'
    ]
  },
  {
    id: 'interlocking',
    name: 'Interlocking & Control Systems',
    subCategories: [
      'Microlok II CBI',
      'Westrace (CBI)',
      'Solid State Interlocking (SSI)',
      'Q-Style Plug-In Relays',
      'Shelf-Type Relay Interlocking',
      'ATRICS / Phoenix Control System'
    ]
  },
  {
    id: 'power',
    name: 'Power Supplies & Distribution',
    subCategories: [
      '120V AC Main Signalling Supply',
      'Signalling UPS System',
      'Battery Bank & Charger Array',
      'Transformer & Isolation Panel',
      'Diesel Backup Generator / AMF',
      'Points Air Compressor Plant'
    ]
  },
  {
    id: 'level-crossings',
    name: 'Level Crossings & Warning Systems',
    subCategories: [
      'Boom Gate Mechanism (Type W)',
      'Flashing Light Assembly & Bells',
      'Pedestrian Swing/Slide Gates',
      'Level Crossing Monitor (LXM)',
      'Cerberus / LC Telemetry System'
    ]
  },
  {
    id: 'wayside',
    name: 'Wayside Monitoring & Alarms',
    subCategories: [
      'Wheel Impact Load Detector (WILD)',
      'Hot Bearing / Hot Wheel (HBD/HWD)',
      'Dragging Equipment Detector (DED)',
      'Points Condition Monitor (PCM)',
      'Landslide / Rockfall Detector',
      'Track Circuit Monitor (TCM)'
    ]
  },
  {
    id: 'enclosures',
    name: 'Enclosures & Environs',
    subCategories: [
      'CER (Central Equipment Room)',
      'SER (Signalling Equipment Room)',
      'Relay House / REB',
      'Location Case (Loc)',
      'Cable Pit & GLD Troughing'
    ]
  }
];

export const WORK_TYPES = [
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
  'Pre-arranged System Testing / Inspection'
];

export interface QuickPart {
  id: string;
  title: string;
  shortLabel: string;
  category: string;
  suggestedWorkType?: string;
  descriptionHtml: string;
}

export interface DeclarationQuickPart {
  id: string;
  label: string;
  text: string;
}

/** Firestore document id for a certifier's personal declaration Quick Parts, keyed by RIW. */
export function certifierQuickPartsDocId(riw: string): string {
  return riw.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export const DEFAULT_QUICK_PARTS: QuickPart[] = [
  {
    id: 'commissioning',
    title: 'New Works & Commissioning Scope',
    shortLabel: 'Commissioning',
    category: 'Testing & Commissioning',
    suggestedWorkType: 'New Works Installation & Commissioning',
    descriptionHtml: `<p><strong>Commissioning Scope:</strong> Final field configuration changes and commissioning of signalling equipment.</p><p><strong>Carried out the following activities:</strong></p><ul><li>Audit Construction Documentation &amp; Circuit Books</li><li>Perform Signal Sighting, Alignment, and Focus Verification</li><li>Execute Wire Count &amp; Bell Correlation Checks</li><li>Prepare / Review Inspection &amp; Test Plan (ITP)</li><li>Joint Range &amp; Test Verification with Network Control</li></ul>`
  },
  {
    id: 'preventative_maintenance',
    title: 'Routine Preventative Maintenance (PM)',
    shortLabel: 'Routine PM',
    category: 'Maintenance',
    suggestedWorkType: 'Routine Preventative Maintenance (PM)',
    descriptionHtml: `<p><strong>Routine Maintenance Scope:</strong> Conducted periodic inspection, cleaning, and operational testing.</p><p><strong>Completed activities:</strong></p><ul><li>Inspected point machine locks, clearances, and mechanical drive rod lubrication</li><li>Measured track circuit feed/relay voltages and drop-out/pick-up parameters</li><li>Cleaned signal lenses and verified aspect indication LEDs</li><li>Checked backup UPS battery voltages and power supply isolation</li></ul>`
  },
  {
    id: 'fault_rectification',
    title: 'Fault Investigation & Rectification',
    shortLabel: 'Fault Investigation',
    category: 'Corrective',
    suggestedWorkType: 'Emergency Fault Rectification & Incident Response',
    descriptionHtml: `<p><strong>Fault Response:</strong> Attended site following signal failure/alarm notification.</p><p><strong>Investigation &amp; Rectification:</strong></p><ul><li>Diagnosed root cause using telemetry logs and multimeter measurements</li><li>Replaced faulty plug-in relay / damaged wiring loom</li><li>Performed functional test &amp; full route correspondence check</li><li>Restored equipment to full operational status with Signalling Tester sign-off</li></ul>`
  },
  {
    id: 'level_crossing',
    title: 'Level Crossing Safety Audit & Testing',
    shortLabel: 'Level Crossing Test',
    category: 'Testing & Commissioning',
    suggestedWorkType: 'Level Crossing Functional Testing (SOP-03)',
    descriptionHtml: `<p><strong>Level Crossing Test Scope:</strong> Performed monthly functional and safety audit of level crossing protection.</p><p><strong>Testing Performed:</strong></p><ul><li>Tested boom gate operation time, drop time, and warning bells</li><li>Verified pedestrian gate interlocks and emergency manual release</li><li>Checked battery charger float voltage and standby power fail-over</li><li>Completed LXM event log review and updated site maintenance book</li></ul>`
  },
  {
    id: 'points_check',
    title: 'Point Machine Inspection & Gauge Check',
    shortLabel: 'Points & Gauge',
    category: 'Maintenance',
    suggestedWorkType: 'Point Machine Cleaning, Lubrication & Gauge Check',
    descriptionHtml: `<p><strong>Points Maintenance Scope:</strong> Conducted mechanical drive, lock, and detection inspection.</p><p><strong>Executed Tasks:</strong></p><ul><li>Checked 3.5mm obstruction test on normal and reverse points</li><li>Inspected claw lock / detector slide wear and lubrication</li><li>Measured motor operating current and throw time under load</li><li>Verified emergency crank handle cut-out switch operation</li></ul>`
  },
  {
    id: 'track_circuit',
    title: 'Track Circuit Shunt & Voltage Testing',
    shortLabel: 'Track Circuit Shunt',
    category: 'Testing & Commissioning',
    suggestedWorkType: 'Track Circuit Shunt & Voltage Testing',
    descriptionHtml: `<p><strong>Track Circuit Scope:</strong> Carried out shunt testing and parameter validation.</p><p><strong>Executed Activities:</strong></p><ul><li>Measured feed and relay end AC/DC operating voltages</li><li>Verified 0.5 ohm fixed shunt resistance drop-out across all rail bonds</li><li>Inspected impedance bonds, fishplates, and insulation joints</li><li>Updated site test record card and logged reference values</li></ul>`
  }
];

export const DEFAULT_SUPERVISORS = [
  { id: 'sup_1', name: 'David Miller', riwNumber: '8839210', title: 'Senior Signal Engineer' },
  { id: 'sup_2', name: 'Sarah Jenkins', riwNumber: '7721094', title: 'Commissioning Manager' },
  { id: 'sup_3', name: 'Michael Chang', riwNumber: '9940123', title: 'Signals Maintenance Supervisor' }
];

export type ActivityTemplate = QuickPart;
export const ACTIVITY_TEMPLATES = DEFAULT_QUICK_PARTS;

