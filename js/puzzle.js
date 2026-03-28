// CORTEX - Puzzle Generation Engine
// Each cell has 6 properties, each with 3 possible values.
// Rules define how properties change across rows/columns using modular arithmetic.
// grid[r][c][prop] = PROPERTIES[prop][(base + r*rowInc + c*colInc) % 3]

export const PROPERTIES = {
  shape:    ['circle', 'triangle', 'square'],
  color:    ['#ff3e5e', '#3ea8ff', '#3eff8e'],
  size:     [0.35, 0.55, 0.75],
  count:    [1, 2, 3],
  fill:     ['solid', 'striped', 'empty'],
  rotation: [0, 120, 240]
};

export const PROP_KEYS = Object.keys(PROPERTIES);

// Human-readable names for hint system
export const PROP_LABELS = {
  shape: 'Shape', color: 'Color', size: 'Size',
  count: 'Count', fill: 'Fill', rotation: 'Rotation'
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getActivePropertyCount(level) {
  if (level <= 2) return 2;
  if (level <= 4) return 3;
  if (level <= 7) return 4;
  if (level <= 11) return 5;
  return 6;
}

export function getMaxTime(level) {
  if (level <= 3) return 45;
  if (level <= 7) return 40;
  if (level <= 12) return 35;
  if (level <= 20) return 30;
  return 25;
}

export function getDifficultyLabel(level) {
  if (level <= 2) return { name: 'Warm-Up', iq: '100' };
  if (level <= 4) return { name: 'Average', iq: '110' };
  if (level <= 7) return { name: 'Above Average', iq: '120' };
  if (level <= 11) return { name: 'Superior', iq: '130' };
  if (level <= 15) return { name: 'Gifted', iq: '140' };
  if (level <= 20) return { name: 'Genius', iq: '160' };
  if (level <= 25) return { name: 'Exceptional', iq: '180' };
  return { name: 'Unmeasurable', iq: '200+' };
}

export function generatePuzzle(level) {
  const numActive = getActivePropertyCount(level);

  // Always include shape; pick the rest randomly
  const mandatory = ['shape'];
  const optional = PROP_KEYS.filter(k => !mandatory.includes(k));
  const picked = shuffle(optional).slice(0, numActive - 1);
  const activeProps = [...mandatory, ...picked];

  // Generate patterns for each property
  const patterns = {};
  const grid = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => ({}))
  );

  for (const prop of PROP_KEYS) {
    const base = Math.floor(Math.random() * 3);

    if (activeProps.includes(prop)) {
      // Active property: pick a non-trivial pattern
      let rowInc, colInc;
      if (level >= 16) {
        // At very high levels, allow all non-constant combos
        do {
          rowInc = Math.floor(Math.random() * 3);
          colInc = Math.floor(Math.random() * 3);
        } while (rowInc === 0 && colInc === 0);
      } else {
        // Simpler patterns: one of (1,0), (0,1), (1,1), (2,0), (0,2)
        const simplePatterns = [[1, 0], [0, 1], [1, 1]];
        if (level >= 8) simplePatterns.push([2, 1], [1, 2], [2, 2]);
        [rowInc, colInc] = simplePatterns[Math.floor(Math.random() * simplePatterns.length)];
      }

      patterns[prop] = { base, rowInc, colInc };
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const idx = (base + r * rowInc + c * colInc) % 3;
          grid[r][c][prop] = PROPERTIES[prop][idx];
        }
      }
    } else {
      // Inactive: constant value
      const val = PROPERTIES[prop][base];
      patterns[prop] = { base, rowInc: 0, colInc: 0 };
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          grid[r][c][prop] = val;
        }
      }
    }
  }

  const answer = { ...grid[2][2] };

  // Generate distractors
  const distractors = generateDistractors(answer, activeProps, level);
  const choices = shuffle([answer, ...distractors]);
  const correctIndex = choices.indexOf(answer);

  return { grid, answer, choices, correctIndex, activeProps, patterns, level };
}

function generateDistractors(answer, activeProps, level) {
  const distractors = [];
  const seen = new Set();
  seen.add(JSON.stringify(answer));
  let guard = 0;

  while (distractors.length < 3 && guard < 100) {
    guard++;
    const d = { ...answer };

    // At higher levels, distractors differ in fewer properties (harder to distinguish)
    const maxChanges = level >= 12 ? 1 : level >= 6 ? Math.min(2, activeProps.length) : Math.min(3, activeProps.length);
    const numChanges = Math.max(1, Math.ceil(Math.random() * maxChanges));
    const propsToChange = shuffle([...activeProps]).slice(0, numChanges);

    for (const prop of propsToChange) {
      const others = PROPERTIES[prop].filter(v => v !== answer[prop]);
      d[prop] = others[Math.floor(Math.random() * others.length)];
    }

    const key = JSON.stringify(d);
    if (!seen.has(key)) {
      seen.add(key);
      distractors.push(d);
    }
  }

  // Fallback: if we couldn't generate enough unique distractors
  while (distractors.length < 3) {
    const d = { ...answer };
    const prop = activeProps[distractors.length % activeProps.length];
    const others = PROPERTIES[prop].filter(v => v !== answer[prop]);
    d[prop] = others[0];
    distractors.push(d);
  }

  return distractors;
}
