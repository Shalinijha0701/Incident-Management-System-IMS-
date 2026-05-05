/**
 * Incident Owner Assignment
 * 
 * Automatically assigns incidents to the appropriate team based on
 * component type and provides team information.
 */

const TEAM_ASSIGNMENT = {
  'RDBMS': { team: 'Database Team', owner: 'DBA', slackChannel: '#incident-db' },
  'API': { team: 'Backend Team', owner: 'Backend Engineer', slackChannel: '#incident-api' },
  'CACHE': { team: 'Platform Team', owner: 'SRE', slackChannel: '#incident-infra' },
  'Async Queue': { team: 'Platform Team', owner: 'SRE', slackChannel: '#incident-infra' },
  'MCP': { team: 'Infra Team', owner: 'Infrastructure Engineer', slackChannel: '#incident-infra' }
};

/**
 * Auto-assign a work item to the appropriate team
 * @param {string} componentType - Type of component
 * @returns {object} Assignment details with team, owner, and contact info
 */
function assignOwner(componentType) {
  const assignment = TEAM_ASSIGNMENT[componentType];
  
  if (!assignment) {
    return {
      team: 'General Team',
      owner: 'On-Call Engineer',
      slackChannel: '#incidents',
      componentType: componentType
    };
  }

  return {
    team: assignment.team,
    owner: assignment.owner,
    slackChannel: assignment.slackChannel,
    componentType: componentType
  };
}

/**
 * Get team information
 * @param {string} team - Team name
 * @returns {object} Team details
 */
function getTeamInfo(team) {
  return {
    team,
    members: [],
    onCallSchedule: '/on-call',
    escalationPath: 'team-lead -> engineering-manager -> director'
  };
}

module.exports = {
  TEAM_ASSIGNMENT,
  assignOwner,
  getTeamInfo
};
