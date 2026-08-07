'use strict';

// @kbach/native is deprecated — the real Babel plugin implementation moved to
// @kbach/react (see @kbach/react/babel-plugin). Kept as a re-export so an
// existing babel.config.js referencing '@kbach/native/babel-plugin' directly
// keeps working with zero edits.
module.exports = require('@kbach/react/babel-plugin');
