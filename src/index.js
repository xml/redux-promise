import { isFSA } from 'flux-standard-action';

function isPromise(val) {
  // We're not enforcing compliance with any particular spec here,
  // just checking most basic promise characteristic: then-ability.
  return val && typeof val.then === 'function';
}

function defaultMapper(sourceState, action) {
  return {
    ...sourceState,
    data: action.payload,
    // always pass on the meta: user can stash whatever they like in there
    meta: action.meta
  }
}

function isMappingFunctionValid(testFunction) {
  if (!testFunction) {
    return false;
  } else if (testFunction && typeof testFunction !== 'function') {
    throw new Error('redux-promise-keeper\'s `handlePromiseAction` function was supplied an argument that should have been a valid value-mapping function, but wasn\'t. Please check the arguments you\'re supplying to `handlePromiseAction`.');
  } else {
    return true;
  }
}

function mappedStateComposer(mapperFunction, state, action) {
  // If user supplied a valid mappingFunction, use it. Otherwise, the default.
  // Default assumes anything not an error and not the original promise
  // is a successful resolution of the promise and contains the value.
  // Note, the value will often be a 'request' object, or similar. This 
  // is why the user has the option to provide a custom mapper.
  const draftState = (isMappingFunctionValid(mapperFunction)) ?
    mapperFunction(state, action) :
    defaultMapper(state, action);
  // mandatory props the user can't override
  draftState.error = (action.error === true) ? true : false;
  draftState.pending = false;
  return draftState;
}

export function handlePromiseAction(type, successMapper, errorMapper) {
  // returns a reducer configured to handle an FSA of that type
  const defaultState = {
    data: undefined,     // corresponds to FSA 'payload'
    error: undefined,    // corresponds to FSA 'error'
    meta: undefined,     // corresponds to FSA 'meta'
    pending: false, // because ES6 promise state can't be inspected
    promise: undefined   
  };

  return (state = defaultState, action) => {
    if ( isFSA(action) && (action.type === type) ) {
      if (isPromise(action.payload)) {
        throw new Error('redux-promise-keeper\'s reducer was invoked on a payload that is a promise. This shouldn\'t be possible if the redux-promise-keeper middleware is active. Please enable the middleware. This reducer will not function properly without it.');
      } else if (action.meta.promise && isPromise(action.meta.promise)) {
        // in this case, we're just caching the action's initial promise:
        return {
          ...state,
          pending: true,
          promise: action.meta.promise
        };
      } else if (action.meta.reset) {
        // To reset the state, just dispatch an action of same type
        // and a meta property that includes `reset`: {meta: {reset: true}}
        return defaultState;
      } else if (action.error === true) {
        // Promise rejected: async failure
        return mappedStateComposer(errorMapper, state, action);
      } else {
        // Promise resolved: async success
        return mappedStateComposer(successMapper, state, action);
      }
    } else {
      return state;
    }
  };
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
          1.  First, we pass along the promise with next(),
              so the promise can be cached or used elsewhere.
              But, we must move it to meta, so it doesn't trigger 
              a race-condition here. 
              NOTE: this means action-handlers must be able to parse
              the different payloads: meta vs. settled values
          2.  Then, we await the promise and dispatch outcome
      */
      next({
        type: action.type, 
        meta: {
          ...action.meta, // don't lose any other meta provided
          promise: action.payload
        } 
      });
      return action.payload.then(
        // Wait for resolve/reject, then unwrap, return, and dispatch:
        // If resolved:
        (result) => {
          dispatch({ ...action, payload: result });
          return result;
        },
        // If rejected: 
        (error) => {
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
