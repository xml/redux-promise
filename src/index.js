import { isFSA } from 'flux-standard-action';

function isPromise(val) {
  // We're not enforcing compliance with any particular spec here,
  // just checking most basic promise characteristic: then-ability.
  return val && typeof val.then === 'function';
}

export default function promiseMiddleware({ dispatch }) {
  return next => action => {
    // If the action isn't FSA-compliant, we provide minimal handling.
    // Should we, or should we just pass it???
    if (!isFSA(action)) {
      // Is the whole action a promise? 
      return isPromise(action)
        /*  
            If so, wait for it to resolve/settle, then dispatch the result.
            But, WHY??? 
            Why would we want to unwrap and dispatch a result
            we weren't asked to handle (as it's not FSA-compliant)? 
            Perhaps throwing an error to indicate the problem? Otherwise, we're
            silently swallowing something people may want...
            And pass it along untouched?
            If nothing else, needs better documentation, for least-surprise. 
        */
        ? action.then(dispatch)
        // If it's not an FSA and not a promise, just pass.
        : next(action);
    }

    // Here's where the real action happens:
    if (isPromise(action.payload)) {
      /*  If the action is an FSA, and the *payload prop* is a promise,
          we do two things:
          1.  We pass along the promise with next(),
              so the promise can be cached or used elsewhere.
              But, we must move it to meta, so it doesn't trigger 
              a race-condition here. 
              NOTE: this means action-handlers must be able to parse
              the different payloads: meta vs. settled values
          2.  We await the promise and dispatch outcome
      */
      next({
        type: action.type, 
        meta: {promise: action.payload} 
      });
      return action.payload.then(
        // Wait for resolve/reject, then unwrap, return, and dispatch:
        // If resolved:
        result => {
          dispatch({ ...action, payload: result });
          return result;
        },
        // If rejected: 
        error => {
          dispatch({ ...action, payload: error, error: true });
          return error;
        }
      )
    } else {
      // otherwise, it's an FSA-compliant action, but not our concern. Pass.
      return next(action);
    }
  };
}
