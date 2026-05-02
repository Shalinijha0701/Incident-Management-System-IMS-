/*
 * Alerting strategies for different component types.
 *
 * The strategy pattern allows us to plug in distinct alerting behaviours
 * depending on the severity of a component failure. For example, an RDBMS
 * outage triggers a P0 alert, whereas a cache failure triggers a less
 * critical P2 alert. The alert() function acts as a simple strategy
 * dispatcher.
 */

class P0AlertStrategy {
  send(workItem) {
    console.log(
      `[P0] Critical alert: component ${workItem.component_type} (${workItem.component_id})`
    );
  }
}

class P1AlertStrategy {
  send(workItem) {
    console.log(
      `[P1] Major alert: component ${workItem.component_type} (${workItem.component_id})`
    );
  }
}

class P2AlertStrategy {
  send(workItem) {
    console.log(
      `[P2] Warning: component ${workItem.component_type} (${workItem.component_id})`
    );
  }
}

const alertStrategies = {
  RDBMS: new P0AlertStrategy(),
  CACHE: new P2AlertStrategy(),
  API: new P1AlertStrategy()
};

/**
 * Dispatch an alert based on the component type. If no strategy exists for
 * the provided type the default P2 strategy is used.
 *
 * @param {string} componentType
 * @param {object} workItem
 */
function alert(componentType, workItem) {
  const strategy = alertStrategies[componentType] || new P2AlertStrategy();
  strategy.send(workItem);
}

module.exports = {
  alert,
  P0AlertStrategy,
  P1AlertStrategy,
  P2AlertStrategy
};