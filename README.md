redux-promise-keeper
====================

<!-- [![build status](https://img.shields.io/travis/acdlite/redux-promise/master.svg?style=flat-square)](https://travis-ci.org/acdlite/redux-promise)
[![npm version](https://img.shields.io/npm/v/redux-promise.svg?style=flat-square)](https://www.npmjs.com/package/redux-promise) -->

[Redux middleware](https://github.com/gaearon/redux/blob/master/docs/middleware.md) for handling promises in [FSA](https://github.com/acdlite/flux-standard-action)-compliant actions. Forked from the estimable [acdlite](https://github.com/acdlite/) in order to add new features and evolve the pattern...

```js
npm install --save git+https://git@github.com/xml/redux-promise-keeper.git
```

Regarding versioning, I've bumped it to 0.6.0 at the fork. 

## Usage: Middleware

The default export from this library is a redux middleware function:

```js
import promiseMiddleware from 'redux-promise-keeper';
// and apply the middleware to your redux store
```

If the middleware receives a Flux Standard Action whose `payload` is a promise, it will immediately dispatch a copy of the action with that promise to the store, from which you can begin chaining/monitoring it. The action will look like:

Then, on a change in the state of the promise (once it is fulfilled or rejected), it will either: 

- dispatch a copy of the action with the resolved value of the promise as its payload, or:
- dispatch a copy of the action with the rejected value of the promise as its payload, and set `error` property to `true`.

### Example:
```js
import createAction from `redux-actions`;
import getDataFunction from 'some-library';

const actionTypeConstant = 'GET_USEFUL_INFO';
const myAction = createAction(actionTypeConstant, getDataFunction);

dispatch(myAction);
/* Dispatched action object looks like this:
    {
        type: 'GET_USEFUL_INFO',
        payload: <promise produced by getDataFunction()>,
        meta: <optional metadata>
    }
*/

// ... then, redux-promise-keeper middleware receives the action, and immediately dispatches a copy, where the promise has been moved into the `meta` object:

dispatch({
    type: 'GET_USEFUL_INFO',
    meta: {
        promise: <promise produced by getDataFunction()>,
        ...<optional: other meta from original action>
    }
});

// Then, redux-promise-keeper awaits the promise's outcome. If it's fulfilled, redux-promise-keeper will:

dispatch({
    type: 'GET_USEFUL_INFO',
    payload: 'resolved value',
    meta: <optional: meta object from original action>
});

// Or, if the promise is rejected (by an error, or otherwise), redux-promise-keeper will dispatch: 
dispatch({
    type: 'GET_USEFUL_INFO',
    error: true,
    payload: <error or other rejection value>,
    meta: <optional: meta object from original action>
});


```

By default, you can do whatever you like with these actions when they hit your reducer. Or, you can use our opinionated reducer to do it for you...

## Usage: Reducer

### `handlePromiseAction(actionType, ?successMapper, ?errorMapper)`

By default, you can simply write your own reducers to receive and interpret the actions dispatched by the middleware. (We recommend `handle-action` from `redux-actions`, fwiw.) However, while we're in the business of establishing spec ways of doing things, to save boilerplate, why should reducers be any different?

Given a standard scenario where you want to request certain data from a server, then just have someplace in the store to keep it, without any complications, why do you need to write custom code?

And, since we're now passing along the original promise from the middleware for you, you want someplace to keep that, right? Why should you need to write code for that as well? 

So, redux-promise-keeper will do it all, if you like. It supplies an opinionated handler function to use in reducers, which simplifies reducer creation for standard async data cases down to 1 line, plus imports:

```js
// in your reducer file, UsefulData.reducer.js...

import handlePromiseAction from 'redux-promise-keeper';
const actionType = 'GET_USEFUL_INFO'; // or import from constants

// Critical: name this const how you want to see it in the store
export const UsefulInfo = handlePromiseAction(actionType);

```

If you successfully import `UsefulInfo` into your reducers array, you can expect to see the following in your store, and your async data will be stored here:

```js
UsefulInfo: {
    data: undefined,
    error: undefined,
    meta: undefined,
    pending: false,
    promise: undefined
  }
```

Here's what the props are for:

* **data**: Whether the promise resolves or rejects, its value/error will be stored here. (Whatever arrives in the FSA-standard `payload` prop.)
* **error**: FSA-standard: if the promise rejects, and the action has an `error` property, this will be set to `true` . (For good measure, it's set to `false` if the promise is fulfilled.)
* **meta**: FSA-standard: whatever arrives on the action's optional `meta` property. ( You can add it to a `redux-action` action using the third argument: `metaCreator`. The redux-promise-keeper middleware will pass it.)
* **pending**: This is the promise's state, accessible synchronously, since ES6 inexplicably didn't include that in the spec. (option: true/false)
* **promise**: The promise is cached here. 

### Using the Mappers

By default, the action's `payload` goes on the `data` property in the store for both success and error, and `meta` goes on `meta`. That's perfectly fine for most uses. 

However, perhaps your promise actually gets resolved with something like a superagent `Request` object, and you don't want that cruft; you just want `Request.body` on the store?

Then use a custom mapper for the success handler and/or for the error handler. Instead of the default version:

```js
function defaultMapper(sourceState, action) {
  return {
    ...sourceState,
    data: action.payload,
    meta: action.meta
  }
}
```

... you could do something like this instead, and supply it as arg to `handlePromiseAction`:

```js
function customMapper(sourceState, action) {
  return {
    ...sourceState, // be sure to pass on the rest of the state!
    data: action.payload.body,
    // always pass on the meta: user can stash whatever they like in there
    meta: action.meta
  }
}
```


### Resetting the Reducer
In case you ever want to reset the values in this reducer, just dispatch an action like this, with the same action name:

```js
{
    type: 'GET_USEFUL_INFO',
    meta: {
        reset: true
        }
}
```


## Notes, FAQ, Examples

### Original Dispatch site receives a Promise from the Middleware
The middleware returns a promise to the caller so that it can wait for the operation to finish before continuing. This is especially useful for server-side rendering. If you find that a promise is not being returned from the middleware, ensure that all middleware before this one in the chain is also returning its `next()` call.

### Using in combination with redux-actions

redux-promise-keeper assumes your actions comply with the Flux Standard Actions (FSA) spec. The easiest way to compose and handle FSAs is with [redux-actions](https://github.com/acdlite/redux-actions), but it's optional.

### Example: Async action creators using Async/Await Pattern

```js
createAction('FETCH_THING', async id => {
  const result = await somePromise;
  return result.someValue;
});
```

### Example: Integrating with a web API module

Say you have an API module that sends requests to a server. This is a common pattern in Flux apps. Assuming your API module produces promises, it's really easy to make some action creators that wrap around it:

```js
import { WebAPI } from '../utils/WebAPI';

export const getThing = createAction('GET_THING', WebAPI.getThing);
export const createThing = createAction('POST_THING', WebAPI.createThing);
export const updateThing = createAction('UPDATE_THING', WebAPI.updateThing);
export const deleteThing = createAction('DELETE_THING', WebAPI.deleteThing);
```

(This could be simplified into a single expression using something like lodash's `mapValues()`.)

## How is redux-promise-keeper different from the original redux-promise? 

1. Caching/'Keeping' promises for later use
2. providing a standard handler/reducer for routine promise-based operations

### Caching the Promises
It's all about the 'keeper'. redux-promise treats promises a bit like they're simply a callback alternative, hiding them from the rest of the redux lifecyle (from reducers or other middleware). Instead, we pass them along so they can be cached on the store and their full power used as an expression of the state of the operation.

This requires being explicit when you're handling actions generated by promise-producing action-creators, as there's now one more action with the same type. But it gets us something very powerful: we're now able to use the full power of promises by using them as chainable representations of the state of the operation, from other contexts. For example: if you launch a network request on one route, or from one component, and you want to check the status of the request (to await completion or launch a new one) from another route or component, you'll now have the promise available at the store so you can do that.

This helps with a few important things:
* allows future consumers to understand the state of the operation
* improves user-experience and reduces network traffic by avoiding repeated requests for the same data
* lets you make full use of the promise API for monitoring operations

### Synchronous status updates
We're also solving for one more detail: in the handler method we use in reducers, we're not only caching the promise so you can chain it, we're also providing an indication of the status of the operation *which you can inspect synchronously*.

Somehow, the ability to do this was left entirely out of the ES6 promise spec, so it needs to be added. Note that if you use a library like Bluebird in lieu of native promises, you not only solve this particular problem, but you also gain better performance, better error-handling, et al. Bluebird should be fully compatible with this library.

## Requirements
redux-promise and redux-promise-keeper both use ES6 syntax.

