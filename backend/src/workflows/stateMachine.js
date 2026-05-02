/*
 * A simple finite state machine that governs the lifecycle of a work item.
 *
 * Valid transitions:
 *   - OPEN → INVESTIGATING
 *   - INVESTIGATING → RESOLVED
 *   - RESOLVED → CLOSED
 *
 * When transitioning into the CLOSED state an RCA must be present on the
 * work item. The state machine does not perform database updates itself;
 * instead it validates transitions and delegates persistence to the caller.
 */

const TRANSITIONS = {
  OPEN: ['INVESTIGATING'],
  INVESTIGATING: ['RESOLVED'],
  RESOLVED: ['CLOSED']
};

class WorkItemStateMachine {
  /**
   * Validate and enforce a state transition on a work item.
   * @param {string} from The current state
   * @param {string} to The desired next state
   * @param {object} workItem A work item object containing at least an rca property
   */
  transition(from, to, workItem) {
    if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid transition: ${from} → ${to}`);
    }
    if (to === 'CLOSED') {
      const rca = workItem.rca;
      // Ensure RCA object exists and contains all mandatory fields
      if (
        !rca ||
        !rca.rootCause ||
        !rca.category ||
        !rca.fix ||
        !rca.prevention
      ) {
        throw new Error(
          'RCA mandatory for CLOSED state: rootCause, category, fix and prevention required'
        );
      }
    }
    // Additional validations could be added here (e.g., mandatory end_time range)
    return true;
  }
}

module.exports = { WorkItemStateMachine, TRANSITIONS };