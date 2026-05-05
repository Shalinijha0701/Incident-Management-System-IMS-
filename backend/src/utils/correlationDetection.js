/**
 * Incident Correlation and Cascade Detection
 * 
 * Detects relationships between incidents to identify cascade failures
 * where one component failure triggers failures in dependent systems.
 */

/**
 * Component dependency map - defines which components depend on others
 */
const DEPENDENCY_MAP = {
  'RDBMS': [],
  'API': ['RDBMS', 'CACHE', 'MCP'],
  'CACHE': ['RDBMS'],
  'Async Queue': ['RDBMS'],
  'MCP': ['CACHE', 'RDBMS']
};

/**
 * Detect if a new incident is correlated to an existing one
 * @param {object} newIncident - New work item
 * @param {array} existingIncidents - Array of other work items
 * @returns {object} Correlation analysis with related incident ID and cascade chain
 */
function detectCorrelation(newIncident, existingIncidents) {
  const correlations = [];
  const newComponentType = newIncident.component_type;
  const timeDiffThreshold = 2 * 60 * 1000; // 2 minutes

  for (const existingIncident of existingIncidents) {
    // Skip if same incident
    if (existingIncident.id === newIncident.id) continue;

    // Skip if existing incident is already closed
    if (existingIncident.status === 'CLOSED') continue;

    const existingComponentType = existingIncident.component_type;
    const timeDiff = Math.abs(new Date(newIncident.start_time) - new Date(existingIncident.start_time));

    // Check if new component depends on existing component
    const dependsOn = DEPENDENCY_MAP[newComponentType] || [];
    if (dependsOn.includes(existingComponentType) && timeDiff < timeDiffThreshold) {
      const correlationStrength = timeDiff < 60000 ? 'strong' : 'moderate';
      correlations.push({
        relatedIncidentId: existingIncident.id,
        relatedComponent: existingComponentType,
        dependencyType: 'dependent',
        correlationStrength,
        timeDiffMinutes: Math.round(timeDiff / 60000),
        cascadeChain: `${existingComponentType} → ${newComponentType}`
      });
    }

    // Check if existing component depends on new component
    const existingDependsOn = DEPENDENCY_MAP[existingComponentType] || [];
    if (existingDependsOn.includes(newComponentType) && timeDiff < timeDiffThreshold) {
      const correlationStrength = timeDiff < 60000 ? 'strong' : 'moderate';
      correlations.push({
        relatedIncidentId: existingIncident.id,
        relatedComponent: existingComponentType,
        dependencyType: 'dependent-on',
        correlationStrength,
        timeDiffMinutes: Math.round(timeDiff / 60000),
        cascadeChain: `${newComponentType} → ${existingComponentType}`
      });
    }
  }

  if (correlations.length === 0) {
    return {
      isCorrelated: false,
      relatedIncidents: []
    };
  }

  // Sort by correlation strength
  correlations.sort((a, b) => {
    const strengthMap = { 'strong': 2, 'moderate': 1 };
    return (strengthMap[b.correlationStrength] || 0) - (strengthMap[a.correlationStrength] || 0);
  });

  return {
    isCorrelated: true,
    relatedIncidents: correlations,
    possibleCascadeRoot: correlations[0].relatedIncidentId,
    cascadeChain: correlations[0].cascadeChain
  };
}

/**
 * Build full cascade chain for an incident
 * @param {object} incident - Work item
 * @param {array} allIncidents - All incidents
 * @returns {array} List of incidents in the cascade chain
 */
function buildCascadeChain(incident, allIncidents) {
  const chain = [incident];
  const visited = new Set([incident.id]);
  const queue = [incident];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDeps = DEPENDENCY_MAP[current.component_type] || [];

    // Find incidents that depend on current
    for (const other of allIncidents) {
      if (visited.has(other.id)) continue;

      const otherDeps = DEPENDENCY_MAP[other.component_type] || [];
      if (otherDeps.includes(current.component_type)) {
        // Check if started within 2 minutes
        const timeDiff = new Date(other.start_time) - new Date(current.start_time);
        if (timeDiff > 0 && timeDiff < 2 * 60 * 1000) {
          visited.add(other.id);
          chain.push(other);
          queue.push(other);
        }
      }
    }
  }

  return chain.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

module.exports = {
  DEPENDENCY_MAP,
  detectCorrelation,
  buildCascadeChain
};
