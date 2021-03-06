/*
 * tokens.js: Resource extensions and routes for working with API tokens.
 *
 * (C) 2012, Nodejitsu Inc.
 *
 */

var uuid = require('node-uuid'),
    async = require('flatiron').common.async;

//
// ### function resource (app)
// #### @app {flatiron.App} Application to extend User resource
//
// Extends the User resource for the `app` with functionality working
// with api tokens.
//
exports.resource = function (app) {

  //
  // Grab the `User` resource from the `app`.
  //
  var User = app.resources.User;
  
  //
  // ### function tokens (username, callback)
  // #### @callback {function} Continuation to respond to when complete.
  //
  // Returns all tokens for the specified `user`.
  //
  User.tokens = function (username, callback) {
    User.get(username, function (err, user) {
      if (err) {
        return callback(err);
      }

      var apiTokens = user.apiTokens || {};

      callback(null, {apiTokens: apiTokens});
    });
  };

  //
  // ### function deleteToken (name, data, callback)
  // #### @username  {string} Name of the user to update
  // #### @tokenname {string} **Optional** Name of the token to add.
  // #### @callback  {function} Continuation to respond to when complete.
  //
  // Delete a API Token
  //
  User.deleteToken = function (username, tokenname, callback) {
    //
    // Fetch the user so we can check for the token
    //
    User.get(username, function (err, user) {
      if (err) {
        return callback(err);
      }

      var apiTokens = user.apiTokens;

      //
      // If there's no such API token we should inform the user
      //
      if(!apiTokens[tokenname]) {
        return callback(new Error("Can't delete token, it does not exist"));
      }

      //
      // Actually remove the token
      //
      delete apiTokens[tokenname];

      //
      // Update the user document with the new `apiTokens`
      // We have now removed the `tokenname` token
      //
      User.update(username, { apiTokens: apiTokens }, function (err) {
        if (err) {
          return callback(err);
        }

        //
        // All done, nothing to give back
        //
        callback();
      });
    });
  };

  //
  // ### function addToken (username, tokenname, callback)
  // #### @username  {string} Name of the user to update
  // #### @tokenname {string} **Optional** Name of the token to add.
  // #### @callback  {function} Continuation to respond to when complete.
  //
  // Adds an API Token
  //
  User.addToken = function (username, tokenname, callback) {
    if (typeof tokenname === "function") {
      callback = tokenname;
      tokenname = 'gen_' + (~~(Math.random() * 1e9)).toString(36);
    }

    //
    // Token is just a uuid generated by us
    //
    var token = uuid.v4();

    //
    // Fetch the existing tokens and add the new one.
    // If tokens did not exist before create them
    //
    User.get(username, function (err, user) {
      if (err) {
        return callback(err);
      }

      //
      // Update our instance
      //
      var apiTokens = user.apiTokens || {};

      //
      // Detect possible collisions
      // Secondary collision could happen, but common...
      //
      for (var key in apiTokens) {
        if(apiTokens[key] === token) {
          token = uuid.v4();
        }
      }

      var newToken = {};

      //
      // Is this an update or insert?
      //
      if(typeof apiTokens[tokenname] === "string") {
        newToken.operation = "update";
      } else {
        newToken.operation = "insert";
      }

      //
      // Create/Update the new token
      //
      apiTokens[tokenname] = token;

      //
      // Update the user document with the new `apiTokens`
      //
      User.update(username, { apiTokens: apiTokens }, function (err) {
        if (err) {
          return callback(err);
        }

        //
        // Generate the response object
        // The user needs to know what his token was named and what the 
        // actual token is
        //
        newToken[tokenname] = token;

        callback(null, newToken);
      });
    });
  };
};

//
// ### function routes (app)
// #### @app {flatiron.App} Application to extend with routes
//
// Extends the target `app` with routes for working with API tokens.
//
exports.routes = function (app) {
  //
  // Setup RESTful web service for `/users/:username/tokens`
  //
  app.router.path('/users/:username/tokens', function () {
    //
    // List Tokens: GET to `/users/:username/tokens` returns list of tokens
    //            for all users.
    //
    this.get(function (username) {
      var res = this.res,
          authMethod = this.req.user.authMethod;

      app.resources.User.tokens(username, function (err, tokens) {
        //
        // If you are not using username and password auth
        //
        if(authMethod.method !== "username/password") {
          //
          // Only return the token you used to authenticate
          //
          var filteredTokens = {apiTokens: {}},
              idFromAuth = authMethod.id;

          filteredTokens.apiTokens[idFromAuth] = tokens.apiTokens[idFromAuth];

          //
          // Return only the current token
          //
          return res.json(200, filteredTokens);
        }

        return err
          ? res.json(500, err)
          : res.json(200, tokens);
      });
    });

    //
    // DELETE /users/:userid/tokens/:tokenname
    //
    this.delete('/:tokenname', function deleteToken(username, tokenname, cb) {
      var res = this.res;

      app.resources.User.deleteToken(username, tokenname, function (err) {
        return err 
             ? res.json(500, err)
             : res.json(201, {ok: true, id: tokenname});
      });
    });

    //
    // Add / Update Token: POST to `/tokens/:username/:tokenname` updates the
    //                   value of the tokens object.
    //
    function addOrUpdateToken(username, tokenname, callback) {
      if (arguments.length === 2) {
        callback = tokenname;
        tokenname = 'token_' + (~~(Math.random() * 1e9)).toString(36);
      }

      var res = this.res;

      app.resources.User.addToken(username, tokenname, 
      function (err, newToken) {
        return err ? res.json(500, err) : res.json(201, newToken);
      });

    }

    //
    // POST /users/:userid/tokens/:tokenname
    //
    this.put('/:tokenname', addOrUpdateToken);

    //
    // POST /users/:userid/tokens
    //
    this.post(addOrUpdateToken);
  });
};
