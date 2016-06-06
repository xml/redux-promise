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
      // is it at least minimally compliant with the promise spec? 
      return isPromise(action)
        /*  If so, wait for it to resolve/settle, then dispatch the result.
            WHY??? 
            Why would we want to unwrap and dispatch a result
            we weren't asked to handle (as it's not FSA-compliant)? 
            We're not even passing along the type, if it exists...
            Would at least passing along FSA properties be a more reasonable failure mode?
            Perhaps throwing an error to indicate the problem? Otherwise, we're
            silently swallowing something people may want...
            perhaps even better just to pass it along untouched?
            If nothing else, needs better documentation, for least-surprise. 
        */
        ? action.then(dispatch)
        // If it's not an FSA and not a promise, just pass.
        : next(action);
    }

    // Here's where the real action happens:
    return isPromise(action.payload)
      /*  If the action is an FSA, and the *payload prop* is a promise,
      */
      ? action.payload.then(
          // wait for resolve/reject, then unwrap and dispatch either:
          // If resolved:
          result => {
            dispatch({ ...action, payload: result });
            // Shouldn't we also be returning the resolved promise here,
            // as we do when rejected? ex.,
            // return Promise.resolve(result);
          },
          // If rejected: 
          error => {
            dispatch({ ...action, payload: error, error: true });
            // In this case, middleware also returns a rejected promise.
            // Received by call-site?
            return Promise.reject(error);
          }
        )
      // otherwise, it's an FSA-compliant action, but not our concern. Pass.
      : next(action);
  };
}
