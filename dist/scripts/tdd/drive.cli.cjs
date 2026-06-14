#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/tsup/assets/cjs_shims.js
var init_cjs_shims = __esm({
  "node_modules/tsup/assets/cjs_shims.js"() {
    "use strict";
  }
});

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.regexpCode = exports2.getEsmExportName = exports2.getProperty = exports2.safeStringify = exports2.stringify = exports2.strConcat = exports2.addCodeArg = exports2.str = exports2._ = exports2.nil = exports2._Code = exports2.Name = exports2.IDENTIFIER = exports2._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports2._CodeOrName = _CodeOrName;
    exports2.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports2.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports2.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports2._Code = _Code;
    exports2.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports2._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports2.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports2.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports2.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports2.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports2.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports2.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports2.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports2.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports2.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports2.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ValueScope = exports2.ValueScopeName = exports2.Scope = exports2.varKinds = exports2.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports2.UsedValueState = UsedValueState = {}));
    exports2.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports2.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports2.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports2.varKinds.var : exports2.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports2.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.or = exports2.and = exports2.not = exports2.CodeGen = exports2.operators = exports2.varKinds = exports2.ValueScopeName = exports2.ValueScope = exports2.Scope = exports2.Name = exports2.regexpCode = exports2.stringify = exports2.getProperty = exports2.nil = exports2.strConcat = exports2.str = exports2._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports2, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports2, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports2, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports2, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports2, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports2, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports2, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports2.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports2.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports2.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports2.not = not;
    var andCode = mappend(exports2.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports2.and = and;
    var orCode = mappend(exports2.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports2.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.checkStrictMode = exports2.getErrorPath = exports2.Type = exports2.useFunc = exports2.setEvaluated = exports2.evaluatedPropsToName = exports2.mergeEvaluated = exports2.eachItem = exports2.unescapeJsonPointer = exports2.escapeJsonPointer = exports2.escapeFragment = exports2.unescapeFragment = exports2.schemaRefOrVal = exports2.schemaHasRulesButRef = exports2.schemaHasRules = exports2.checkUnknownRules = exports2.alwaysValidSchema = exports2.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports2.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports2.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports2.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports2.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports2.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports2.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports2.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports2.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports2.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports2.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports2.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports2.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports2.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports2.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports2.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports2.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports2.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports2.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports2.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendErrors = exports2.resetErrorsCount = exports2.reportExtraError = exports2.reportError = exports2.keyword$DataError = exports2.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports2.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports2.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports2.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports2.reportError = reportError;
    function reportExtraError(cxt, error = exports2.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports2.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports2.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports2.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.boolOrEmptySchema = exports2.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports2.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports2.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getRules = exports2.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports2.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports2.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.shouldUseRule = exports2.shouldUseGroup = exports2.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports2.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports2.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports2.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.reportTypeError = exports2.checkDataTypes = exports2.checkDataType = exports2.coerceAndCheckDataType = exports2.getJSONTypes = exports2.getSchemaTypes = exports2.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports2.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports2.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports2.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports2.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports2.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports2.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports2.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports2.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateUnion = exports2.validateArray = exports2.usePattern = exports2.callValidateCode = exports2.schemaProperties = exports2.allSchemaProperties = exports2.noPropertyInData = exports2.propertyInData = exports2.isOwnProperty = exports2.hasPropFunc = exports2.reportMissingProp = exports2.checkMissingProp = exports2.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports2.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports2.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports2.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports2.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports2.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports2.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports2.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports2.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports2.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports2.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports2.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports2.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports2.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateKeywordUsage = exports2.validSchemaType = exports2.funcKeywordCode = exports2.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports2.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports2.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports2.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports2.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendSubschemaMode = exports2.extendSubschemaData = exports2.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports2.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports2.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports2.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    module2.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var traverse = module2.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getSchemaRefs = exports2.resolveUrl = exports2.normalizeId = exports2._getFullPath = exports2.getFullPath = exports2.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports2.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports2.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports2._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports2.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports2.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports2.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getData = exports2.KeywordCxt = exports2.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports2.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports2.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports2.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports2.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports2.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveSchema = exports2.getCompilingSchema = exports2.resolveRef = exports2.compileSchema = exports2.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports2.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports2.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve2.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports2.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports2.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve2(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports2.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports2, module2) {
    module2.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path6) {
      let input = path6;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(input[i])) {
          output += input[i];
        } else {
          output += escape(input[i]);
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module2.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path6, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path6 && path6 !== "/" ? path6 : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module2.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve2(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const resolved = resolveComponent(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative2, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative2 = parse(serialize(relative2, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative2.scheme) {
        target.scheme = relative2.scheme;
        target.userinfo = relative2.userinfo;
        target.host = relative2.host;
        target.port = relative2.port;
        target.path = removeDotSegments(relative2.path || "");
        target.query = relative2.query;
      } else {
        if (relative2.userinfo !== void 0 || relative2.host !== void 0 || relative2.port !== void 0) {
          target.userinfo = relative2.userinfo;
          target.host = relative2.host;
          target.port = relative2.port;
          target.path = removeDotSegments(relative2.path || "");
          target.query = relative2.query;
        } else {
          if (!relative2.path) {
            target.path = base.path;
            if (relative2.query !== void 0) {
              target.query = relative2.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative2.path[0] === "/") {
              target.path = removeDotSegments(relative2.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative2.path;
              } else if (!base.path) {
                target.path = relative2.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative2.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative2.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative2.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escapePreservingEscapes(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = URL.domainToASCII(parsed.host.toLowerCase());
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
            }
          }
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.fragment) {
            try {
              parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
            } catch {
              parsed.error = parsed.error || "URI malformed";
            }
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri === "string") {
        const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts);
        return malformedAuthorityOrPort ? void 0 : normalized;
      }
      if (typeof uri === "object") {
        return serialize(uri, opts);
      }
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve: resolve2,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module2.exports = fastUri;
    module2.exports.default = fastUri;
    module2.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports2.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv2 = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema: loadSchema2 } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema2(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv2.ValidationError = validation_error_1.default;
    Ajv2.MissingRefError = ref_error_1.default;
    exports2.default = Ajv2;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.callRef = exports2.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports2.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports2.callRef = callRef;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports2.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports2.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports2.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports2.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports2.validateAdditionalItems = validateAdditionalItems;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports2.validateTuple = validateTuple;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateSchemaDeps = exports2.validatePropertyDeps = exports2.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports2.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports2.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports2.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports2.validateSchemaDeps = validateSchemaDeps;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports2.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports2.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.contentVocabulary = exports2.metadataVocabulary = void 0;
    exports2.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports2.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft7.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports2.default = draft7Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports2.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports2, module2) {
    module2.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "node_modules/ajv/dist/ajv.js"(exports2, module2) {
    "use strict";
    init_cjs_shims();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MissingRefError = exports2.ValidationError = exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = exports2.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv2 = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports2.Ajv = Ajv2;
    module2.exports = exports2 = Ajv2;
    module2.exports.Ajv = Ajv2;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = Ajv2;
    var validate_1 = require_validate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports2, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports2, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// scripts/tdd/drive.cli.ts
init_cjs_shims();
var import_node_child_process9 = require("child_process");
var import_node_crypto2 = require("crypto");
var fs12 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
var readline = __toESM(require("readline"), 1);

// scripts/tdd/replay-artifacts.ts
init_cjs_shims();
var import_fs = require("fs");
var import_path = require("path");

// scripts/tdd/tdd-paths.ts
init_cjs_shims();
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var planningDir = (tdd) => (0, import_node_path.join)(tdd, "planning");
var sprintsDir = (tdd) => (0, import_node_path.join)(tdd, "sprints");
var cyclesRootDir = (tdd) => (0, import_node_path.join)(tdd, "cycles");
var experimentsRootDir = (tdd) => (0, import_node_path.join)(tdd, "experiments");
var escalationsDir = (tdd) => (0, import_node_path.join)(tdd, "escalations");
var escalationFile = (tdd, id) => (0, import_node_path.join)(escalationsDir(tdd), `${id}.json`);
var acReviewJson = (tdd, f, s, ac) => (0, import_node_path.join)(cyclesRootDir(tdd), f, s, ac, "review.json");
var workflowStateJson = (tdd) => (0, import_node_path.join)(tdd, "workflow-state.json");
var designGuideJson = (tdd) => (0, import_node_path.join)(tdd, "design", "design-guide.json");
var architectureDir = (tdd) => (0, import_node_path.join)(tdd, "architecture");
var architectureConventionsJson = (tdd) => (0, import_node_path.join)(architectureDir(tdd), "conventions.json");
var featureProposalsMd = (tdd) => (0, import_node_path.join)(planningDir(tdd), "feature-proposals.md");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureSpecJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-spec.json");
var featureRequestMd = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "feature-request.md");
var architectureJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "architecture.json");
var pipelineJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "pipeline.json");
var featureDeployEvidenceJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "deploy-evidence.json");
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "story.json");
var acsDir = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "acs");
var acJson = (tdd, f, s, ac) => (0, import_node_path.join)(acsDir(tdd, f, s), `${ac}.json`);
var storyTestListJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "test-list-per-story.json");
var handbackFile = (tdd, f, role, story) => (0, import_node_path.join)(featureDir(tdd, f), ".handback", `${role}${story ? `.${story}` : ""}.md`);
var cycleDir = (tdd, f, s, ac) => (0, import_node_path.join)(cyclesRootDir(tdd), f, s, ac);
var sprintDir = (tdd, sprint) => (0, import_node_path.join)(sprintsDir(tdd), sprint);
var sprintGatesJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "gates.json");
var backlogJson = (tdd, sprint) => (0, import_node_path.join)(sprintDir(tdd, sprint), "backlog.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
function requireFeatureDir(tdd, featureId) {
  const dir = findFeatureDir(tdd, featureId);
  if (!dir) throw new Error(`feature ${featureId} not found (or ambiguous) under ${featuresDir(tdd)}`);
  return dir;
}
function storyAcIds(tdd, f, s) {
  const ids = /* @__PURE__ */ new Set();
  const sj = storyJson(tdd, f, s);
  if (fs.existsSync(sj)) {
    try {
      const data = JSON.parse(fs.readFileSync(sj, "utf8"));
      if (Array.isArray(data.acs)) {
        for (const a of data.acs) {
          const id = typeof a === "string" ? a : a?.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
      }
    } catch {
    }
  }
  const dir = acsDir(tdd, f, s);
  if (fs.existsSync(dir)) {
    try {
      for (const file of fs.readdirSync(dir)) {
        const m = /^(.+)\.json$/.exec(file);
        if (!m) continue;
        const base = m[1];
        try {
          const obj = JSON.parse(fs.readFileSync((0, import_node_path.join)(dir, file), "utf8"));
          if (obj && typeof obj.id === "string" && obj.id === base) ids.add(base);
        } catch {
        }
      }
    } catch {
    }
  }
  return [...ids];
}
function readAcLayer(tdd, f, acId) {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return void 0;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8"));
      if (ac.layer === "API" || ac.layer === "E2E" || ac.layer === "Infra") return ac.layer;
    } catch {
    }
  }
  return void 0;
}
function readAcArchitecturalNotes(tdd, f, acId) {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return void 0;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof ac.architectural_notes === "string" && ac.architectural_notes.trim().length > 0) {
        return ac.architectural_notes;
      }
    } catch {
    }
  }
  return void 0;
}
var hasFeatureRequest = (tdd, f) => fs.existsSync(featureRequestMd(tdd, f));
var TSHIRT_SIZES = /* @__PURE__ */ new Set(["XS", "S", "M", "L", "XL"]);
var isTshirtSize = (x) => typeof x === "string" && TSHIRT_SIZES.has(x);
var planningEstimatesJson = (tdd) => (0, import_node_path.join)(planningDir(tdd), "estimates.json");
function readEstimates(tdd) {
  const file = planningEstimatesJson(tdd);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data.estimates)) return [];
    return data.estimates.flatMap((e) => {
      const id = e?.feature_id;
      const size = e?.size;
      if (typeof id !== "string" || !id || !isTshirtSize(size)) return [];
      const rationale = e?.rationale;
      return [{ feature_id: id, size, ...typeof rationale === "string" ? { rationale } : {} }];
    });
  } catch {
    return [];
  }
}
var hasEstimates = (tdd) => readEstimates(tdd).length > 0;
var backlogFeatureIds = (b) => b.features.map((f) => f.id);
function readBacklog(tdd, sprint) {
  const file = backlogJson(tdd, sprint);
  if (!fs.existsSync(file)) return { sprint, features: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const features = Array.isArray(data.features) ? data.features.flatMap((x) => {
      if (typeof x === "string" && x.length > 0) return [{ id: x }];
      const id = x?.id;
      if (typeof id !== "string" || !id) return [];
      const size = x?.size;
      return [{ id, ...isTshirtSize(size) ? { size } : {} }];
    }) : [];
    return { sprint, features };
  } catch {
    return { sprint, features: [] };
  }
}
function writeBacklog(tdd, backlog) {
  fs.mkdirSync(sprintDir(tdd, backlog.sprint), { recursive: true });
  fs.writeFileSync(backlogJson(tdd, backlog.sprint), JSON.stringify(backlog, null, 2) + "\n", "utf8");
}
function syncBacklog(tdd, sprint) {
  const sizeOf = new Map(readEstimates(tdd).map((e) => [e.feature_id, e.size]));
  const root = featuresDir(tdd);
  const committed = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => {
    try {
      return fs.statSync((0, import_node_path.join)(root, d)).isDirectory() && fs.existsSync((0, import_node_path.join)(root, d, "feature-request.md"));
    } catch {
      return false;
    }
  }).sort() : [];
  const features = committed.map((id) => {
    const size = sizeOf.get(id);
    return { id, ...size ? { size } : {} };
  });
  const backlog = { sprint, features };
  writeBacklog(tdd, backlog);
  return backlog;
}

// scripts/tdd/replay-artifacts.ts
var REPLAYABLE_DESIGN_ROLES = /* @__PURE__ */ new Set([
  "spec-author",
  "architect-reviewer",
  "test-strategist",
  "ux-designer",
  "product-owner"
]);
function cp(src, dst) {
  if (!(0, import_fs.existsSync)(src)) return false;
  (0, import_fs.mkdirSync)((0, import_path.dirname)(dst), { recursive: true });
  (0, import_fs.copyFileSync)(src, dst);
  return true;
}
function cpDir(srcDir, dstDir, transform) {
  if (!(0, import_fs.existsSync)(srcDir)) return false;
  let copied = false;
  (0, import_fs.mkdirSync)(dstDir, { recursive: true });
  for (const name of (0, import_fs.readdirSync)(srcDir)) {
    const s = (0, import_path.join)(srcDir, name);
    if (!(0, import_fs.statSync)(s).isFile()) continue;
    const text = (0, import_fs.readFileSync)(s, "utf8");
    (0, import_fs.writeFileSync)((0, import_path.join)(dstDir, name), transform ? transform(name, text) : text);
    copied = true;
  }
  return copied;
}
function stripLayer(name, text) {
  if (!name.endsWith(".json")) return text;
  try {
    const ac = JSON.parse(text);
    delete ac.layer;
    return JSON.stringify(ac, null, 2) + "\n";
  } catch {
    return text;
  }
}
function replayDesignTurn(args) {
  const { turn, replayDir, tddDir, featureId } = args;
  const cf = (0, import_path.join)(featuresDir(replayDir), featureId);
  const tf = (0, import_path.join)(featuresDir(tddDir), featureId);
  switch (turn.role) {
    case "spec-author": {
      if (turn.mode === "propose") {
        return cp((0, import_path.join)(replayDir, "planning", "feature-proposals.md"), (0, import_path.join)(tddDir, "planning", "feature-proposals.md"));
      }
      if (turn.mode === "breakdown") {
        let ok = cp((0, import_path.join)(cf, "feature-spec.json"), (0, import_path.join)(tf, "feature-spec.json"));
        cp((0, import_path.join)(cf, "feature-spec.md"), (0, import_path.join)(tf, "feature-spec.md"));
        const storiesSrc = (0, import_path.join)(cf, "stories");
        if ((0, import_fs.existsSync)(storiesSrc)) {
          for (const s of (0, import_fs.readdirSync)(storiesSrc)) {
            cp((0, import_path.join)(storiesSrc, s, "story.json"), (0, import_path.join)(tf, "stories", s, "story.json"));
            cp((0, import_path.join)(storiesSrc, s, "story.md"), (0, import_path.join)(tf, "stories", s, "story.md"));
          }
        }
        return ok;
      }
      if (turn.story) {
        return cpDir((0, import_path.join)(cf, "stories", turn.story, "acs"), (0, import_path.join)(tf, "stories", turn.story, "acs"), stripLayer);
      }
      return false;
    }
    case "architect-reviewer": {
      let ok = cp((0, import_path.join)(cf, "architecture.json"), (0, import_path.join)(tf, "architecture.json"));
      cp((0, import_path.join)(cf, "architecture.md"), (0, import_path.join)(tf, "architecture.md"));
      if (turn.story) {
        const acs = cpDir((0, import_path.join)(cf, "stories", turn.story, "acs"), (0, import_path.join)(tf, "stories", turn.story, "acs"));
        ok = ok || acs;
      }
      return ok;
    }
    case "test-strategist": {
      let ok = cp((0, import_path.join)(cf, "test-list.json"), (0, import_path.join)(tf, "test-list.json"));
      cp((0, import_path.join)(cf, "test-list.md"), (0, import_path.join)(tf, "test-list.md"));
      const story = turn.story;
      if (story) {
        cp((0, import_path.join)(cf, "stories", story, "test-list-per-ac.json"), (0, import_path.join)(tf, "stories", story, "test-list-per-ac.json"));
      }
      return ok;
    }
    case "ux-designer": {
      let ok = cp((0, import_path.join)(replayDir, "design", "design-guide.json"), (0, import_path.join)(tddDir, "design", "design-guide.json"));
      cp((0, import_path.join)(replayDir, "design", "design-guide.md"), (0, import_path.join)(tddDir, "design", "design-guide.md"));
      cp((0, import_path.join)(replayDir, "design", "ia.md"), (0, import_path.join)(tddDir, "design", "ia.md"));
      return ok;
    }
    default:
      return false;
  }
}

// scripts/tdd/replay-build.ts
init_cjs_shims();
var import_fs2 = require("fs");
var import_path2 = require("path");
var SCAFFOLD_OWNED = /* @__PURE__ */ new Set([
  ".git",
  ".tdd",
  ".lakebase",
  "scripts",
  ".claude",
  ".github",
  "node_modules"
]);
var JUNK_DIRS = /* @__PURE__ */ new Set([
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".git",
  "node_modules"
]);
var JUNK_FILES = /* @__PURE__ */ new Set([".env", ".DS_Store", "Makefile", "deploy-targets.yaml"]);
function codeTreeFilter(root) {
  return (src) => {
    const rel = src.slice(root.length).replace(/^[/\\]+/, "");
    if (rel === "") return true;
    const segs = rel.split(/[/\\]/);
    if (SCAFFOLD_OWNED.has(segs[0])) return false;
    if (segs.some((s) => JUNK_DIRS.has(s))) return false;
    const base = segs[segs.length - 1];
    return !(JUNK_FILES.has(base) || base.endsWith(".pyc"));
  };
}
function storyTurnsDir(replayBuildDir, featureId, story) {
  return (0, import_path2.join)(featuresDir(replayBuildDir), featureId, "stories", story, "turns");
}
function listBuildTurns(replayBuildDir, featureId, story) {
  const dir = storyTurnsDir(replayBuildDir, featureId, story);
  if (!(0, import_fs2.existsSync)(dir)) return [];
  return (0, import_fs2.readdirSync)(dir).filter((n) => !n.startsWith(".")).sort();
}
function replayBuildTurn(args) {
  const { replayBuildDir, projectDir, tddDir, featureId, story, turnIndex } = args;
  const turns = listBuildTurns(replayBuildDir, featureId, story);
  if (turnIndex < 1 || turnIndex > turns.length) return false;
  const turnDir = (0, import_path2.join)(storyTurnsDir(replayBuildDir, featureId, story), turns[turnIndex - 1]);
  const codeSrc = (0, import_path2.join)(turnDir, "code");
  if (!(0, import_fs2.existsSync)(codeSrc)) return false;
  (0, import_fs2.cpSync)(codeSrc, projectDir, { recursive: true, force: true, filter: codeTreeFilter(codeSrc) });
  const cyclesSrc = (0, import_path2.join)(turnDir, "tdd", "cycles");
  if ((0, import_fs2.existsSync)(cyclesSrc)) {
    (0, import_fs2.cpSync)(cyclesSrc, cyclesRootDir(tddDir), {
      recursive: true,
      force: true,
      filter: (src) => (0, import_fs2.statSync)(src).isDirectory() || src.endsWith("review-verdict.json")
    });
  }
  return true;
}

// scripts/tdd/record-build.ts
init_cjs_shims();
var import_fs3 = require("fs");
var import_path3 = require("path");
function turnSlug(turn, role, ac, mode) {
  const n = String(turn).padStart(3, "0");
  return [n, role, mode, ac].filter(Boolean).join("-");
}
function recordBuildTurn(args) {
  const { recordBuildDir, projectDir, tddDir, featureId, story, turn, role, ac, mode } = args;
  const turnDir = (0, import_path3.join)(
    featuresDir(recordBuildDir),
    featureId,
    "stories",
    story,
    "turns",
    turnSlug(turn, role, ac, mode)
  );
  (0, import_fs3.mkdirSync)(turnDir, { recursive: true });
  (0, import_fs3.cpSync)(projectDir, (0, import_path3.join)(turnDir, "code"), {
    recursive: true,
    force: true,
    filter: codeTreeFilter(projectDir)
  });
  const cyclesSrc = cyclesRootDir(tddDir);
  if ((0, import_fs3.existsSync)(cyclesSrc)) (0, import_fs3.cpSync)(cyclesSrc, (0, import_path3.join)(turnDir, "tdd", "cycles"), { recursive: true, force: true });
  const expSrc = experimentsRootDir(tddDir);
  if ((0, import_fs3.existsSync)(expSrc)) (0, import_fs3.cpSync)(expSrc, (0, import_path3.join)(turnDir, "tdd", "experiments"), { recursive: true, force: true });
  return turnDir;
}

// scripts/tdd/turn-recorder.ts
init_cjs_shims();
var import_node_crypto = require("crypto");
var import_node_fs = require("fs");
var import_node_path2 = require("path");
var NON_ARTIFACT_TDD = /* @__PURE__ */ new Set(["agent-log.jsonl"]);
function labelForAction(action) {
  const a = action;
  const kind = String(a.kind ?? "turn");
  if (kind === "invoke-role") {
    const role = String(a.role ?? "role");
    const mode = a.buildMode ?? a.mode;
    return mode ? `${role}-${mode}` : role;
  }
  if (kind === "approve-gate" || kind === "approve-plan-gate" || kind === "approve-promote-gate") {
    if (kind === "approve-plan-gate") return "gate-plan";
    if (kind === "approve-promote-gate") return "gate-promote";
    return "gate-spec";
  }
  if (kind === "approve-deploy-gate") return "gate-deploy";
  if (kind === "surface-gate") return "gate-surface";
  return kind;
}
function sha1(abs) {
  return (0, import_node_crypto.createHash)("sha1").update((0, import_node_fs.readFileSync)(abs)).digest("hex");
}
function walk(dir, keep) {
  if (!(0, import_node_fs.existsSync)(dir)) return [];
  const out = [];
  for (const entry of (0, import_node_fs.readdirSync)(dir)) {
    const abs = (0, import_node_path2.join)(dir, entry);
    if (keep && !keep(abs)) continue;
    let st;
    try {
      st = (0, import_node_fs.statSync)(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs, keep));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}
function scan(projectDir, tddDir) {
  const map = /* @__PURE__ */ new Map();
  for (const abs of walk(tddDir)) {
    const rel = (0, import_node_path2.relative)(projectDir, abs);
    if (NON_ARTIFACT_TDD.has((0, import_node_path2.relative)(tddDir, abs))) continue;
    map.set(rel, { abs, rel, underTdd: true, sha: sha1(abs) });
  }
  const keep = codeTreeFilter(projectDir);
  for (const abs of walk(projectDir, keep)) {
    const rel = (0, import_node_path2.relative)(projectDir, abs);
    if (map.has(rel)) continue;
    map.set(rel, { abs, rel, underTdd: false, sha: sha1(abs) });
  }
  return map;
}
function writeRecorderState(recordDir, cur) {
  const files = {};
  for (const [rel, f] of cur) files[rel] = f.sha;
  (0, import_node_fs.mkdirSync)(recordDir, { recursive: true });
  (0, import_node_fs.writeFileSync)((0, import_node_path2.join)(recordDir, ".recorder-state.json"), JSON.stringify({ files }, null, 2) + "\n");
}
function seedRecorderBaseline(args) {
  if ((0, import_node_fs.existsSync)((0, import_node_path2.join)(args.recordDir, ".recorder-state.json"))) return false;
  writeRecorderState(args.recordDir, scan(args.projectDir, args.tddDir));
  return true;
}
function readState(recordDir) {
  const f = (0, import_node_path2.join)(recordDir, ".recorder-state.json");
  if (!(0, import_node_fs.existsSync)(f)) return { files: {} };
  try {
    return JSON.parse((0, import_node_fs.readFileSync)(f, "utf8"));
  } catch {
    return { files: {} };
  }
}
function readIndex(recordDir) {
  const f = (0, import_node_path2.join)(recordDir, "turns", "index.json");
  if (!(0, import_node_fs.existsSync)(f)) return [];
  try {
    const data = JSON.parse((0, import_node_fs.readFileSync)(f, "utf8"));
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}
function pad(n) {
  return String(n).padStart(4, "0");
}
function recordTurn(args) {
  const { recordDir, projectDir, tddDir, action, step } = args;
  const a = action;
  const prior = readState(recordDir);
  const cur = scan(projectDir, tddDir);
  const produced = [];
  for (const [rel, f] of cur) {
    if (prior.files[rel] !== f.sha) produced.push(rel);
  }
  const deleted = [];
  for (const rel of Object.keys(prior.files)) {
    if (!cur.has(rel)) deleted.push(rel);
  }
  produced.sort();
  deleted.sort();
  const ordinal = readIndex(recordDir).length;
  const label = labelForAction(action);
  const dirName = `${pad(ordinal)}-${label}`;
  const turnDir = (0, import_node_path2.join)(recordDir, "turns", dirName);
  (0, import_node_fs.mkdirSync)((0, import_node_path2.join)(turnDir, "files"), { recursive: true });
  const artifactsDir = (0, import_node_path2.join)(recordDir, "recorded-artifacts");
  for (const rel of produced) {
    const f = cur.get(rel);
    const dst = (0, import_node_path2.join)(turnDir, "files", rel);
    (0, import_node_fs.mkdirSync)((0, import_node_path2.dirname)(dst), { recursive: true });
    (0, import_node_fs.cpSync)(f.abs, dst);
    if (f.underTdd) {
      const mirror = (0, import_node_path2.join)(artifactsDir, (0, import_node_path2.relative)(tddDir, f.abs));
      (0, import_node_fs.mkdirSync)((0, import_node_path2.dirname)(mirror), { recursive: true });
      (0, import_node_fs.cpSync)(f.abs, mirror);
    }
  }
  for (const rel of deleted) {
    const abs = (0, import_node_path2.join)(projectDir, rel);
    if (abs.startsWith(tddDir)) {
      const mirror = (0, import_node_path2.join)(artifactsDir, (0, import_node_path2.relative)(tddDir, abs));
      if ((0, import_node_fs.existsSync)(mirror)) (0, import_node_fs.rmSync)(mirror, { force: true });
    }
  }
  const manifest = {
    ordinal,
    step,
    label,
    kind: String(a.kind ?? "turn"),
    role: a.role,
    mode: a.buildMode ?? a.mode,
    story: a.story,
    ac: a.ac,
    action,
    produced,
    deleted
  };
  (0, import_node_fs.writeFileSync)((0, import_node_path2.join)(turnDir, "turn.json"), JSON.stringify(manifest, null, 2) + "\n");
  const index = readIndex(recordDir);
  const entry = {
    ordinal,
    step,
    label,
    kind: manifest.kind,
    role: manifest.role,
    mode: manifest.mode,
    story: manifest.story,
    ac: manifest.ac,
    dir: dirName,
    producedCount: produced.length,
    deletedCount: deleted.length
  };
  index.push(entry);
  (0, import_node_fs.mkdirSync)((0, import_node_path2.join)(recordDir, "turns"), { recursive: true });
  (0, import_node_fs.writeFileSync)((0, import_node_path2.join)(recordDir, "turns", "index.json"), JSON.stringify({ turns: index }, null, 2) + "\n");
  writeRecorderState(recordDir, cur);
  return { ordinal, dir: dirName, produced, deleted };
}

// scripts/tdd/orchestrator-run.ts
init_cjs_shims();

// scripts/tdd/orchestrator-drive.ts
init_cjs_shims();
function uxDesignerPending(s) {
  return !!s.uiTrack && s.breakdownDone && !s.designGuideReady;
}
function nextDesignAction(state) {
  if (!state.breakdownDone) {
    return { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
  }
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }
  for (const story of state.storyOrder) {
    const v = state.stories[story];
    if (v?.gateApproved) continue;
    const design = v?.design ?? { hasAcs: false, architectAnnotated: false, testListReady: false };
    if (!design.hasAcs) return { kind: "invoke-role", role: "spec-author", story };
    if (!design.architectAnnotated) return { kind: "invoke-role", role: "architect-reviewer", story };
    if (!design.testListReady) return { kind: "invoke-role", role: "test-strategist", story };
    if (!v?.gateSurfaced) return { kind: "surface-gate", story };
    return { kind: "approve-gate", story };
  }
  return { kind: "design-complete" };
}
function nextBuildAction(story, b) {
  if (!b.experimentCut) return { kind: "cut-experiment", story };
  if (b.reviewAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "review", ac: b.reviewAc };
  if (b.refactorAc) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor", ac: b.refactorAc };
  if (b.assessGreenAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "assess", ac: b.assessGreenAc };
  if (b.repairRegressionAc) return { kind: "invoke-role", role: "driver", story, buildMode: "repair", ac: b.repairRegressionAc };
  if (!b.testsWritten) return { kind: "invoke-role", role: "navigator", story };
  if (!b.codeWritten) return { kind: "invoke-role", role: "driver", story };
  if (!b.awaitingAcceptance) return { kind: "await-acceptance", story };
  if (!b.deployVerified) return { kind: "await-acceptance", story };
  if (!b.accepted) return { kind: "accept", story };
  return { kind: "complete", story };
}
function nextTransition(state) {
  if (state.escalation) {
    const e = state.escalation;
    if (e.routable) {
      return {
        kind: "revise-route",
        story: e.routable.story,
        role: e.routable.owning_role,
        gate: e.routable.gate,
        reason: e.reason,
        source: e.source
      };
    }
    return { kind: "raise-to-hil", reason: e.reason, source: e.source, ...e.story_id ? { story: e.story_id } : {} };
  }
  if (state.phase === "planning") {
    const p = state.planning ?? { proposed: false, estimated: false, requestsAuthored: false };
    if (!p.proposed) return { kind: "invoke-role", role: "spec-author", mode: "propose" };
    if (!p.skipSizing && !p.estimated) return { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" };
    if (!p.requestsAuthored) return { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
    if (!p.gateApproved) return { kind: "approve-plan-gate" };
    return { kind: "planning-complete" };
  }
  if (state.phase === "deploy") {
    const d = state.deploy ?? { deployed: false, gateApproved: false };
    if (!d.deployed) return { kind: "deploy" };
    if (!d.gateApproved) return { kind: "approve-deploy-gate" };
    return { kind: "deploy-complete" };
  }
  if (state.phase === "promote") {
    const pr = state.promote ?? { prReady: false, ciGreen: false, prApproved: false, merged: false };
    if (!pr.prReady) return { kind: "prepare-pr" };
    if (!pr.ciGreen) return { kind: "wait-ci" };
    if (!pr.prApproved) return { kind: "approve-promote-gate" };
    if (!pr.merged) return { kind: "merge" };
    return { kind: "done" };
  }
  if (state.phase === "done") return { kind: "done" };
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }
  if (state.buildActive) {
    return nextBuildAction(state.buildActive, state.stories[state.buildActive].build);
  }
  for (const story of state.storyOrder) {
    const v = state.stories[story];
    if (v?.gateApproved && !v.build.accepted) return { kind: "dispatch", story };
  }
  const design = nextDesignAction(toDesignView(state));
  if (design.kind === "design-complete") return { kind: "feature-complete" };
  return design;
}
function toDesignView(state) {
  return {
    breakdownDone: state.breakdownDone,
    storyOrder: state.storyOrder,
    uiTrack: state.uiTrack,
    designGuideReady: state.designGuideReady,
    stories: Object.fromEntries(
      Object.entries(state.stories).map(([id, v]) => [
        id,
        { gateApproved: v.gateApproved, gateSurfaced: v.gateSurfaced, design: v.design }
      ])
    )
  };
}
function nextDesignOnlyTransition(state) {
  return nextDesignAction(toDesignView(state));
}
function pauseBeforeMilestone(m) {
  switch (m) {
    case "navigator":
      return (a) => a.kind === "invoke-role" && a.role === "navigator" && a.buildMode === void 0;
    case "release-engineer":
      return (a) => a.kind === "await-acceptance" || a.kind === "deploy";
  }
}
function actionLane(action) {
  switch (action.kind) {
    case "invoke-role": {
      if ("mode" in action) {
        return action.mode === "breakdown" ? "design" : "planning";
      }
      return action.role === "navigator" || action.role === "driver" ? "build" : "design";
    }
    case "approve-plan-gate":
    case "planning-complete":
      return "planning";
    case "surface-gate":
    case "approve-gate":
    case "design-complete":
      return "design";
    case "dispatch":
    case "cut-experiment":
    case "await-acceptance":
    case "accept":
    case "complete":
      return "build";
    case "feature-complete":
      return "coarse";
    case "deploy":
    case "approve-deploy-gate":
      return "deploy";
    case "deploy-complete":
    case "prepare-pr":
    case "wait-ci":
    case "approve-promote-gate":
    case "merge":
      return "promote";
    case "raise-to-hil":
      return "done";
    case "revise-route":
      return "design";
    case "done":
      return "done";
  }
}
function isHitlGateAction(action) {
  return action.kind === "approve-gate" || action.kind === "approve-plan-gate" || action.kind === "approve-deploy-gate" || action.kind === "approve-promote-gate" || action.kind === "accept";
}
function isHumanInputAction(action) {
  return action.kind === "invoke-role" && "mode" in action && action.mode === "author-requests";
}

// scripts/tdd/orchestrator-expect.ts
init_cjs_shims();
var ProtocolViolationError = class extends Error {
  constructor(handoff, detail) {
    super(
      `PROTOCOL VIOLATION: expected ${handoff.responder}${handoff.story ? ` (story ${handoff.story}${handoff.ac ? `/${handoff.ac}` : ""})` : ""} to return ${handoff.expected}, but ${detail}. Aborting workflow.`
    );
    this.handoff = handoff;
    this.detail = detail;
    this.name = "ProtocolViolationError";
  }
  handoff;
  detail;
};
var UnexpectedCallbackError = class extends Error {
  constructor(from, scope, expected) {
    const where = scope.story ? ` (story ${scope.story}${scope.ac ? `/${scope.ac}` : ""})` : "";
    super(
      `PROTOCOL VIOLATION: unexpected callback from ${from}${where} , no outstanding handoff awaits it (awaiting: ${expected.length ? expected.join(", ") : "nothing"}). Aborting workflow.`
    );
    this.from = from;
    this.scope = scope;
    this.expected = expected;
    this.name = "UnexpectedCallbackError";
  }
  from;
  scope;
  expected;
};
function sig(action) {
  return JSON.stringify(action);
}
function storyOf(action) {
  return "story" in action ? action.story : void 0;
}
function expectationFor(action) {
  if (action.kind !== "invoke-role") return null;
  const responder = action.role;
  const story = storyOf(action);
  const signature = sig(action);
  const base = { signature, responder, ...story ? { story } : {} };
  const storyView2 = (s) => story ? s.stories[story] : void 0;
  if (responder === "spec-author" && "mode" in action && action.mode === "breakdown") {
    return {
      ...base,
      expected: "a feature breakdown (\u22651 story)",
      satisfiedBy: (s) => s.breakdownDone === true,
      remediation: "Write feature-spec.json with a NON-EMPTY `stories[]` array and create the story stub dirs under .tdd/features/<feature>/stories/. The feature dir currently holds only feature-request.md; a prose list of stories in your reply is NOT the breakdown."
    };
  }
  if (responder === "spec-author" && "mode" in action && action.mode === "propose") {
    return { ...base, expected: "feature proposals", satisfiedBy: (s) => s.planning?.proposed === true };
  }
  if (responder === "ux-designer") {
    return { ...base, expected: "a design guide", satisfiedBy: (s) => s.designGuideReady === true };
  }
  if (responder === "spec-author") {
    return { ...base, expected: "drafted acceptance criteria (non-empty)", satisfiedBy: (s) => storyView2(s)?.design.hasAcs === true };
  }
  if (responder === "architect-reviewer" && "mode" in action && action.mode === "estimate") {
    return { ...base, expected: "a t-shirt size estimate", satisfiedBy: (s) => s.planning?.estimated === true };
  }
  if (responder === "architect-reviewer") {
    return { ...base, expected: "layer/NFR-annotated ACs", satisfiedBy: (s) => storyView2(s)?.design.architectAnnotated === true };
  }
  if (responder === "test-strategist") {
    return { ...base, expected: "a non-empty per-story test list mapped to the story's ACs", satisfiedBy: (s) => storyView2(s)?.design.testListReady === true };
  }
  const buildMode = "buildMode" in action ? action.buildMode : void 0;
  const ac = "ac" in action ? action.ac : void 0;
  const withAc = { ...base, ...ac ? { ac } : {} };
  if (responder === "navigator" && buildMode === "review") {
    return { ...withAc, expected: `a REVIEW verdict for ${ac}`, satisfiedBy: (s) => storyView2(s)?.build.reviewAc !== ac };
  }
  if (responder === "driver" && buildMode === "refactor") {
    return { ...withAc, expected: `a completed REFACTOR for ${ac}`, satisfiedBy: (s) => storyView2(s)?.build.refactorAc !== ac };
  }
  return null;
}
function handbackMessage(h, attempt) {
  return [
    `HANDBACK (attempt ${attempt}): your previous turn did not return ${h.expected}${h.story ? ` for story ${h.story}${h.ac ? `/${h.ac}` : ""}` : ""}.`,
    `The expected artifact is absent / null / empty / nonconformant ON DISK (the orchestrator verified it).`,
    `Do NOT claim it "already exists" or that "no further artifacts are needed": prose describing the artifact is NOT the artifact.`,
    `Re-inspect the filesystem yourself, then WRITE the artifact this turn.`,
    ...h.remediation ? [h.remediation] : [],
    `This is a retry; the workflow aborts if it is still missing.`
  ].join(" ");
}
var ExpectationLedger = class {
  constructor(maxRetries = 1) {
    this.maxRetries = maxRetries;
  }
  maxRetries;
  outstanding = [];
  /** Unmet-callback count per outstanding handoff signature. */
  attempts = /* @__PURE__ */ new Map();
  /** Record a new outstanding handoff (the call we are waiting on). */
  push(h) {
    this.outstanding.push(h);
  }
  /** Whether anything is outstanding. */
  get pending() {
    return this.outstanding.length > 0;
  }
  /** The head expectation (next expected callback), or undefined. */
  head() {
    return this.outstanding[0];
  }
  /** The responders currently awaited (for diagnostics / wrong-caller messages). */
  awaiting() {
    return this.outstanding.map((h) => h.responder);
  }
  /**
   * INTAKE PROCESSOR , process a callback from a SPECIFIC responder against the
   * outstanding expectations (the caller-identity half of the protocol; the part
   * that becomes load-bearing once dispatch is concurrent / multi-threaded):
   *   - find the first outstanding handoff whose responder === `from` (and, when
   *     given, whose story/ac match the callback's scope). NO match => the caller
   *     is wrong / unexpected => throw UnexpectedCallbackError (abort).
   *   - matched + contract met -> remove it (the right caller delivered).
   *   - matched + unmet, retry budget remains -> `retry` (hand back + re-dispatch).
   *   - matched + unmet, no budget -> throw ProtocolViolationError (abort).
   * Matching the responder (not blindly the head) lets concurrent stories' build
   * callbacks arrive interleaved while still rejecting a callback from a role we
   * are not awaiting at all.
   */
  processCallback(from, state, scope = {}) {
    const idx = this.outstanding.findIndex(
      (h2) => h2.responder === from && (scope.story === void 0 || h2.story === scope.story) && (scope.ac === void 0 || h2.ac === scope.ac)
    );
    if (idx === -1) {
      throw new UnexpectedCallbackError(from, scope, this.awaiting());
    }
    const h = this.outstanding[idx];
    if (h.satisfiedBy(state)) {
      this.outstanding.splice(idx, 1);
      this.attempts.delete(h.signature);
      return { kind: "met", handoff: h };
    }
    const attempt = (this.attempts.get(h.signature) ?? 0) + 1;
    this.attempts.set(h.signature, attempt);
    if (attempt > this.maxRetries) {
      throw new ProtocolViolationError(
        h,
        `it returned nothing across ${attempt} attempts (the expected artifact is absent / null / empty)`
      );
    }
    return { kind: "retry", handoff: h, detail: handbackMessage(h, attempt), attempt };
  }
  /**
   * Reconcile the realized state against the HEAD expectation , the deterministic
   * (single-outstanding, in-order) specialization of processCallback. The
   * single-threaded driver dispatches one role at a time, so the only possible
   * responder IS the head's, and reconcile delegates with that identity:
   *   - met   -> pop it.
   *   - unmet, retry budget remains -> `retry` (hand-back + re-dispatch).
   *   - unmet, no budget -> throw ProtocolViolationError.
   * A no-op (`idle`) when nothing is outstanding.
   */
  reconcile(state) {
    const head = this.outstanding[0];
    if (!head) return { kind: "idle" };
    return this.processCallback(head.responder, state, { ...head.story ? { story: head.story } : {}, ...head.ac ? { ac: head.ac } : {} });
  }
};

// scripts/tdd/orchestrator-run.ts
var DriverStalledError = class extends Error {
  constructor(action, iteration) {
    super(
      `driver stalled at iteration ${iteration}: action ${JSON.stringify(action)} repeated without advancing state. The effect for this action did not change what readState() returns.`
    );
    this.action = action;
    this.iteration = iteration;
    this.name = "DriverStalledError";
  }
  action;
  iteration;
};
var MAX_ITERATIONS = 1e4;
function driverBoundOptions(bound) {
  switch (bound) {
    case "plan":
      return { stopWhen: (a) => a.kind === "planning-complete" };
    case "design":
      return { transition: nextDesignOnlyTransition, stopWhen: (a) => a.kind === "design-complete" };
    case "build":
      return { stopWhen: (a) => actionLane(a) !== "build" };
    case "deploy":
      return { stopWhen: (a) => actionLane(a) !== "deploy" && actionLane(a) !== "promote" };
  }
}
async function runDriver(effects, options = {}) {
  let previousSignature;
  let pausedAlready = false;
  const enforceExpectations = options.enforceExpectations !== false;
  const expectations = new ExpectationLedger();
  for (let i = 0; ; i++) {
    if (options.maxSteps !== void 0 && i >= options.maxSteps) {
      return { iterations: i, stoppedAtMax: true };
    }
    if (i >= MAX_ITERATIONS) {
      throw new Error(`driver exceeded ${MAX_ITERATIONS} iterations without reaching "done".`);
    }
    const state = await effects.readState();
    let retrying = false;
    if (enforceExpectations) {
      const rec = expectations.reconcile(state);
      if (rec.kind === "retry") {
        retrying = true;
        effects.onHandback?.(rec.handoff, rec.detail);
      }
    }
    const transition = options.transition ?? nextTransition;
    const action = transition(state);
    if (action.kind === "done") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1 };
    }
    if (action.kind === "raise-to-hil") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1, escalated: true, escalation: action };
    }
    if (options.stopWhen?.(action)) {
      return { iterations: i, stoppedAtBound: true, stoppedAt: action };
    }
    if (!pausedAlready && options.pauseBefore?.(action) && options.confirmContinue) {
      pausedAlready = true;
      await options.confirmContinue(action);
    }
    const signature = JSON.stringify(action);
    if (!retrying && signature === previousSignature) {
      throw new DriverStalledError(action, i);
    }
    previousSignature = signature;
    if (enforceExpectations && !retrying) {
      const handoff = expectationFor(action);
      if (handoff) expectations.push(handoff);
    }
    effects.onAction?.(action, i);
    await effects.perform(action);
  }
}

// scripts/tdd/escalation.ts
init_cjs_shims();
var fs6 = __toESM(require("fs"), 1);

// scripts/tdd/smells.ts
init_cjs_shims();
var import_fs6 = require("fs");
var import_path6 = require("path");

// scripts/tdd/run-cycle.ts
init_cjs_shims();

// scripts/lakebase/get-connection.ts
init_cjs_shims();
var import_node_child_process2 = require("child_process");
var import_lakebase = require("@databricks/lakebase");
var import_pg = require("pg");

// scripts/lakebase/branch-utils.ts
init_cjs_shims();
var import_node_child_process = require("child_process");
var import_node_util = require("util");

// scripts/lakebase/branch-id.ts
init_cjs_shims();

// scripts/lakebase/kit-config.ts
init_cjs_shims();
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
var DAY_MS = 24 * 60 * 60 * 1e3;
var KIT_TIMEOUTS = {
  cliDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_DEFAULT_MS", 3e4),
  cliCreateBranch: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_BRANCH_MS", 6e4),
  cliCreateEndpoint: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_ENDPOINT_MS", 6e4),
  readyWait: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_WAIT_MS", 12e4),
  readyPoll: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_POLL_MS", 5e3),
  pgConnect: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_CONNECT_MS", 1e4),
  pgStatement: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_STATEMENT_MS", 15e3),
  gitDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_DEFAULT_MS", 5e3),
  gitCheckout: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_CHECKOUT_MS", 1e4),
  gitNetwork: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_NETWORK_MS", 15e3),
  gitPush: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_PUSH_MS", 3e4),
  cliLong: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_LONG_MS", 6e4),
  cmdShort: intFromEnv("LAKEBASE_KIT_TIMEOUT_CMD_SHORT_MS", 5e3),
  initializrCacheTtl: intFromEnv("LAKEBASE_KIT_INITIALIZR_CACHE_TTL_MS", 10 * 60 * 1e3),
  featureBranchTtlMs: intFromEnv("LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS", 30 * DAY_MS),
  testBranchTtlMs: intFromEnv("LAKEBASE_KIT_TEST_BRANCH_TTL_MS", 14 * DAY_MS),
  uatBranchTtlMs: intFromEnv("LAKEBASE_KIT_UAT_BRANCH_TTL_MS", 14 * DAY_MS),
  perfBranchTtlMs: intFromEnv("LAKEBASE_KIT_PERF_BRANCH_TTL_MS", 7 * DAY_MS)
};
function urlFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}
var KIT_REGISTRIES = {
  mavenCentral: urlFromEnv("LAKEBASE_KIT_REGISTRY_MAVEN_CENTRAL", "https://repo1.maven.org/maven2"),
  springInitializr: urlFromEnv("LAKEBASE_KIT_REGISTRY_SPRING_INITIALIZR", "https://start.spring.io")
};

// scripts/lakebase/branch-utils.ts
var execFileP = (0, import_node_util.promisify)(import_node_child_process.execFile);

// scripts/lakebase/constants.ts
init_cjs_shims();

// scripts/tdd/experiment.ts
init_cjs_shims();

// scripts/lakebase/paired-branch.ts
init_cjs_shims();
var fs4 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var import_node_child_process7 = require("child_process");

// scripts/lakebase/branch-create.ts
init_cjs_shims();
var import_node_child_process4 = require("child_process");
var import_node_util3 = require("util");

// scripts/util/poll-until.ts
init_cjs_shims();

// scripts/util/delay.ts
init_cjs_shims();

// scripts/util/sanitize-branch-name.ts
init_cjs_shims();
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 63);
  while (name.length < 3) name += "-x";
  return name;
}

// scripts/lakebase/lakebase-project.ts
init_cjs_shims();
var import_node_child_process3 = require("child_process");
var import_node_util2 = require("util");
var execFileP2 = (0, import_node_util2.promisify)(import_node_child_process3.execFile);

// scripts/lakebase/branch-create.ts
var execFileP3 = (0, import_node_util3.promisify)(import_node_child_process4.execFile);

// scripts/lakebase/branch-delete.ts
init_cjs_shims();
var import_node_child_process5 = require("child_process");
var import_node_util4 = require("util");
var execFileP4 = (0, import_node_util4.promisify)(import_node_child_process5.execFile);

// scripts/lakebase/branch-endpoint.ts
init_cjs_shims();
var import_node_child_process6 = require("child_process");

// scripts/git/status.ts
init_cjs_shims();

// scripts/util/exec.ts
init_cjs_shims();
var cp2 = __toESM(require("child_process"), 1);

// scripts/lakebase/env-file.ts
init_cjs_shims();
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// scripts/lakebase/databricks-profile.ts
init_cjs_shims();
var fs3 = __toESM(require("fs"), 1);

// scripts/tdd/agent-log.ts
init_cjs_shims();
var import_fs5 = require("fs");
var import_path5 = require("path");

// scripts/tdd/schema-loader.ts
init_cjs_shims();
var import_fs4 = require("fs");
var import_path4 = require("path");
var import_ajv = __toESM(require_ajv(), 1);
var SCHEMA_DIR = (0, import_path4.join)(__dirname, "schemas");
var ajv = new import_ajv.default({ allErrors: true, strict: false });
var validatorCache = /* @__PURE__ */ new Map();
function loadSchema(name) {
  return JSON.parse((0, import_fs4.readFileSync)((0, import_path4.join)(SCHEMA_DIR, name), "utf8"));
}
function getValidator(name) {
  const cached = validatorCache.get(name);
  if (cached) return cached;
  const validate = ajv.compile(loadSchema(name));
  validatorCache.set(name, validate);
  return validate;
}
function formatSchemaErrors(validate) {
  const errors = validate.errors ?? [];
  if (errors.length === 0) return ["schema validation failed"];
  return errors.map((e) => {
    const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${where}: ${e.message ?? "invalid"}`;
  });
}

// scripts/tdd/agent-log-events.ts
init_cjs_shims();
var EVENT_TEMPLATES = {
  // Orchestration lifecycle (code-emitted)
  "handoff": { template: "dispatch {{to_role}} for {{phase}}" },
  "phase.start": { template: "{{role}} START {{phase}}" },
  "phase.end": { template: "{{role}} END {{phase}} ({{outcome}})" },
  "escalation.raised": { template: "RAISED TO HIL [{{source}}]: {{reason}}" },
  // Gates (code surfaces; HIL / Human Proxy decides)
  "gate.surfaced": { template: "GATE {{gate}} awaiting decision , {{subject}}" },
  "gate.approved": { template: "GATE {{gate}} APPROVED" },
  "gate.rejected": { template: "GATE {{gate}} REJECTED: {{reason}}" },
  "gate.modified": { template: "GATE {{gate}} MODIFIED: {{change}}" },
  // Intake & planning
  "intake.supplied": { template: "INTAKE supplied {{artifact}}" },
  "intake.refused": { template: "INTAKE refused {{artifact}}: {{reason}}" },
  // Artifacts & design (agent-emitted)
  "artifact.written": { template: "{{role}} wrote {{artifact}} , {{summary}}" },
  "open.question": { template: "OPEN Q [{{scope}}]: {{question}}" },
  "concern.flagged": { template: "CONCERN {{concern}} , owner {{owner_layer}}" },
  // Build cycle (cycle.* family: RED -> GREEN -> REVIEW -> REFACTOR)
  "cycle.red": { template: "RED {{test_id}} [{{ac}}]: {{asserts}}" },
  "cycle.green": { template: "GREEN {{test_id}} [{{ac}}]: {{change}}" },
  "cycle.review": { template: "REVIEW [{{ac}}] refactor={{refactor}}: {{rationale}}" },
  "cycle.refactored": { template: "REFACTOR [{{ac}}]: {{change}}" },
  "smell.flagged": { template: "SMELL {{smell}} ({{severity}}): {{detail}}" },
  "runner.missing": { template: "NO RUNNER for layer {{layer}} (test {{test_id}})" },
  // Experiment lifecycle (code-emitted)
  "experiment.cut": { template: "EXPERIMENT cut for {{story}}" },
  "experiment.accepted": { template: "EXPERIMENT accepted (merged) for {{story}}" },
  "experiment.discarded": { template: "EXPERIMENT discarded for {{story}}: {{reason}}" },
  "experiment.revised": { template: "EXPERIMENT revised for {{story}}: {{reason}}" },
  // Deploy / verify (code-emitted from the deploy CLI)
  "deploy.start": { template: "DEPLOY start {{scope}} -> {{target}}" },
  "deploy.reachable": { template: "DEPLOY reachable {{url}} (pid {{pid}})" },
  "deploy.unreachable": { template: "DEPLOY unreachable {{url}}: {{reason}}" },
  "deploy.verified": { template: "DEPLOY verified {{scope}} @ {{url}} , verify {{verify_status}}" },
  "deploy.failed": { template: "DEPLOY failed {{scope}}: {{reason}}" },
  "verify.passed": { template: "VERIFY passed {{scope}} ({{command}})" },
  "verify.failed": { template: "VERIFY failed {{scope}} ({{command}}): {{summary}}" },
  // UX adherence
  "adherence.passed": { template: "ADHERENCE passed {{scope}}" },
  "adherence.failed": { template: "ADHERENCE failed {{scope}}: {{diffs}}" },
  // Per-turn model usage (code-emitted by the runner from the claude -p result).
  // input_tokens is the turn's CONTEXT SIZE (prompt the model processed); the
  // cache_* + cost_usd ride in metadata (not template slots, so not required).
  "turn.usage": { template: "{{role}} turn used {{input_tokens}} input + {{output_tokens}} output tokens" },
  // Generic (agent-emitted; debug / interim)
  "reasoning": { template: "{{note}}" },
  "progress": { template: "{{note}} , {{step}}" }
};
var AGENT_LOG_EVENT_NAMES = Object.keys(EVENT_TEMPLATES);
function isKnownEvent(name) {
  return Object.prototype.hasOwnProperty.call(EVENT_TEMPLATES, name);
}
var AgentLogEventError = class extends Error {
};
function renderEventMessage(event, slots = {}) {
  if (!isKnownEvent(event)) {
    throw new AgentLogEventError(
      `unknown agent-log event "${event}" (not in the closed vocabulary). Allowed: ${AGENT_LOG_EVENT_NAMES.join(", ")}`
    );
  }
  const tmpl = EVENT_TEMPLATES[event].template;
  return tmpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, name) => {
    const v = slots[name];
    if (v === void 0 || v === null || v === "") {
      throw new AgentLogEventError(`agent-log event "${event}" is missing required slot "${name}"`);
    }
    return String(v);
  });
}

// scripts/tdd/agent-log.ts
function logFilePath(tddDir) {
  return (0, import_path5.join)(tddDir, "agent-log.jsonl");
}
function emitAgentLogEvent(input, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const slots = input.slots ?? {};
  const renderCtx = {
    role: input.role,
    ...input.feature_id !== void 0 ? { feature_id: input.feature_id } : {},
    ...input.phase !== void 0 ? { phase: input.phase } : {},
    ...input.cycle_id !== void 0 ? { cycle_id: input.cycle_id } : {},
    ...slots
  };
  const message = renderEventMessage(input.event, renderCtx);
  const metadata = {
    ...input.feature_id !== void 0 ? { feature_id: input.feature_id } : {},
    ...input.phase !== void 0 ? { phase: input.phase } : {},
    ...input.cycle_id !== void 0 ? { cycle_id: input.cycle_id } : {},
    ...slots,
    ...input.metadata ?? {}
  };
  const event = {
    timestamp: input.timestamp ?? now().toISOString(),
    level: input.level,
    role: input.role,
    // model + effort sit right after role (the per-turn dispatch events carry them).
    ...input.model ? { model: input.model } : {},
    ...input.effort ? { effort: input.effort } : {},
    event: input.event,
    message,
    ...Object.keys(metadata).length > 0 ? { metadata } : {}
  };
  const validate = getValidator("agent-log-event.schema.json");
  if (!validate(event)) {
    throw new Error(`invalid agent log event: ${formatSchemaErrors(validate).join("; ")}`);
  }
  (0, import_fs5.appendFileSync)(logFilePath(tddDir), `${JSON.stringify(event)}
`, "utf8");
  return event;
}

// scripts/tdd/run-cycle.ts
function readAcLayer2(tddDir, featureId, acId) {
  return readAcLayer(tddDir, featureId, acId);
}
function coveredTestIds(c) {
  if (c.test_ids && c.test_ids.length > 0) return c.test_ids;
  return c.test_id ? [c.test_id] : [];
}

// scripts/tdd/smells.ts
var SMELL_CATALOG = [
  {
    name: "test-list-drift",
    description: "Test list grew by >25% since cycle start without HITL approval.",
    proposed_remediation: "PO refinement on spec.",
    // A drifted/non-orderable test list is a test-strategist decomposition
    // defect: route the remediation back to Gate 3 on `revise`.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list"
  },
  {
    name: "superseded-tests",
    description: "A new AC intentionally supersedes behavior encoded in PRIOR tests (often from earlier features); the Navigator flagged them in a superseded-tests allowlist. NOT a contradiction to block (that is test-list-drift), the latest AC wins and the accumulated tests must follow it.",
    proposed_remediation: "Driver permissively refactors ONLY the flagged tests (and the code) to the new AC, then the honest-GREEN verify re-runs. Bounded to one attempt; an unflagged regression escalates.",
    level: "build"
  },
  {
    name: "cycle-stall",
    description: "N cycles in a row with no GREEN.",
    proposed_remediation: "Re-examine test ordering or spec ambiguity."
  },
  {
    name: "api-coherence-drift",
    description: "Same concept named differently across two consecutive PASS reviews.",
    proposed_remediation: "Rename refactor before next test."
  },
  {
    name: "fragility-ratio",
    description: "One behavior change failed >3 tests.",
    proposed_remediation: "Refactor + flag tests-mirror-implementation anti-pattern."
  },
  {
    name: "test-cost-spiral",
    description: "Each subsequent test takes >2x the lines of the prior one.",
    proposed_remediation: "Reconsider boundary; outer-loop tests probably needed."
  },
  {
    name: "cross-experiment-divergence",
    description: "Two parallel experiments are solving different problems.",
    proposed_remediation: "Was an opinion gap hidden? Re-run design-spec gate."
  },
  {
    name: "dead-requirement-signal",
    description: "An AC has had no scenarios written in N cycles while others mature.",
    proposed_remediation: "Deprecate or clarify via PO refinement."
  },
  {
    name: "test-deletion-attempt",
    description: "Driver or human attempts to remove or weaken an existing test.",
    proposed_remediation: "Hard block. Tests are immutable until the test list itself is renegotiated."
  },
  {
    name: "boundary-violation",
    description: "Test references a private method or internal helper.",
    proposed_remediation: "Refactor to public boundary or move to inner-loop list."
  },
  {
    name: "import-time-build-coupling",
    description: "The app entry module requires an optional build artifact (e.g. client/dist) at module load time, an unconditional StaticFiles mount / asset read at import scope. It greens where the artifact happens to exist and crashes at import everywhere it does not (backend-only test runs, CI before the client build, fresh clones). Caught deterministically by the `lakebase-tdd-imports-clean` gate; the Navigator may also flag it in REVIEW.",
    proposed_remediation: "Guard the coupling: mount the compiled client ONLY when its directory exists, and serve a clear 503 from the SPA route when index.html is absent, so the module imports without the artifact. See the dev/prod-parity rule in software-design-principles."
  },
  {
    name: "scaffold-defect",
    description: "A test cannot run because the project scaffold is missing a piece the kit owns (e.g. tests/e2e/conftest.py + the live_server fixture for an E2E AC, or an absent runner). The role flags it instead of fabricating the missing scaffold itself. Blocking: a fabricated fixture diverges from the shipped one + reintroduces the CI-parity bugs the kit template prevents.",
    proposed_remediation: "Halt + surface to the HIL. Fix the scaffold (re-run the kit's wiring, e.g. --enable-e2e for the project's language), never hand-author the missing piece in the build."
  },
  {
    name: "ac-overlap",
    description: "Two acceptance criteria in a story are not independent: satisfying one's `then` inherently satisfies (or contradicts) another, so the dependent AC's test can never go RED without deleting shipped code. A spec/test-list decomposition defect. Blocking, and flagged at the design gate (Gate 3) so it halts BEFORE a build cycle is wasted, rather than surfacing mid-build as a cycle-stall.",
    proposed_remediation: "Surface to the PO at the gate. Merge the overlapping ACs, differentiate their observable behavior, or (PO decision) accept the dependent AC as already-satisfied. Do not order both as separate cycles.",
    // An AC overlap is a spec-author decomposition defect: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec"
  },
  {
    name: "layering-violation",
    description: "The boundary/routes layer touches persistence directly (calls the DB session: .query/.add/.commit/.delete on a route handler) or business logic lives in the boundary/templates, instead of delegating to a service + repository. A fat controller violates the layered-architecture contract the architect declared in architecture.json `layers`. Distinct from `boundary-violation` (which is a TEST reaching a private method). Caught deterministically by `lakebase-tdd-layering-clean`; the Navigator may also flag it in REVIEW.",
    proposed_remediation: "Extract a service (business logic) + a repository (the ONLY layer that touches the ORM/session); the route handler validates input + delegates. Defended by the layering fitness test (tests/architecture/test_layering.py)."
  },
  {
    name: "ux-adherence",
    description: "The rendered UI defines the design tokens on :root yet does not USE them at the element level: hardcoded hex colors / raw px where a var(--token) belongs, an ia.md data-testid seam that was never rendered, or an action surface (form/submit) with no feedback affordance (no silent failure / unacknowledged success). Token-level adherence (assertDesignAdherence) cannot see this; the element-level checks in design-adherence.ts do, and the UX Designer flags it in REVIEW. Distinct from `layering-violation` (engineering layering): this is the experience-lens gate.",
    proposed_remediation: "Consume tokens via var(--token) (no hardcoded hex/px), render every ia.md screen with its data-testid seams, and give every action a perceivable result. Refactor the UI to the design guide; do not weaken the guide to match the drift."
  },
  {
    name: "e2e-inline-regex-flag",
    description: "An E2E Playwright matcher (to_contain_text/to_have_text/to_have_url/get_by_text) is built from a Python regex carrying INLINE FLAGS , re.compile(r\"(?i)summary\") and the like. Playwright forwards the pattern's `.pattern` string verbatim to the browser's JavaScript regex engine, which does NOT support inline-flag syntax `(?i)`/`(?s)`/`(?m)`, so the regex is invalid and the assertion can never match the running app. The test is structurally un-greenable: the honest-GREEN verify rejects it and the build raises to HIL. Caught deterministically + cheaply (no browser run) by the e2e-regex-clean static lint, which enriches the GREEN-verify failure with the exact file:line + fix.",
    proposed_remediation: 'Pass the flag as a kwarg, not inline: re.compile("summary", re.IGNORECASE) emits the valid JS regex /summary/i. Or, for a plain case-insensitive substring, use the bare string form Playwright already matches loosely. See the E2E rule in the Navigator role.'
  },
  {
    name: "e2e-row-perma-red",
    description: "An E2E-tagged test row has failed or had zero recorded runs for N or more consecutive cycles.",
    proposed_remediation: "Surface to PO: either fix the runner wiring (BASE_URL, paired-branch endpoint, playwright.config), narrow the failing scenario, or retag the AC to a layer with a working runner."
  }
];
function specLevelSmell(name) {
  const def = SMELL_CATALOG.find((s) => s.name === name);
  if (!def || def.level !== "spec" || !def.owning_role || !def.gate_to_rerun) return null;
  return { owning_role: def.owning_role, gate_to_rerun: def.gate_to_rerun };
}
var BUILD_REFACTOR_ROUTABLE = /* @__PURE__ */ new Set([
  "layering-violation",
  "ux-adherence",
  "import-time-build-coupling",
  // A new AC supersedes behavior encoded in PRIOR tests the Navigator flagged
  // (superseded-tests allowlist). The Driver's refactor turn permissively
  // refactors ONLY those flagged tests + the code, then the honest-GREEN verify
  // re-runs. Bounded to one attempt by supersession.refactored; an unflagged
  // regression never reaches here (it escalates), so the backstop stays intact.
  "superseded-tests"
]);
function isBuildRefactorRoutableSmell(name) {
  return BUILD_REFACTOR_ROUTABLE.has(name);
}
function readSmellsLog(tddDir) {
  const file = (0, import_path6.join)(tddDir, "smells.json");
  if (!(0, import_fs6.existsSync)(file)) return { detected: [] };
  return JSON.parse((0, import_fs6.readFileSync)(file, "utf8"));
}
function smellMatches(entry, smell, story_id) {
  if (entry.smell !== smell) return false;
  if (story_id === void 0) return true;
  return entry.story_id === void 0 || entry.story_id === story_id;
}
function priorReviseCount(tddDir, smell, story_id) {
  return readSmellsLog(tddDir).detected.filter(
    (d) => d.resolution_kind === "revised" && smellMatches(d, smell, story_id)
  ).length;
}

// scripts/tdd/cycle-record.ts
init_cjs_shims();
var import_fs7 = require("fs");
var import_path7 = require("path");

// scripts/tdd/test-list.ts
init_cjs_shims();

// scripts/tdd/deploy.ts
init_cjs_shims();
var import_node_child_process8 = require("child_process");
var import_node_fs3 = require("fs");
var import_node_path4 = require("path");

// scripts/lakebase/deploy-targets.ts
init_cjs_shims();

// scripts/tdd/e2e-regex-clean.ts
init_cjs_shims();
var import_node_fs2 = require("fs");
var import_node_path3 = require("path");

// scripts/tdd/deploy.ts
function deployEvidencePasses(e) {
  return e !== void 0 && e.reachable === true && e.verify?.passed === true;
}
function readDeployEvidence(file) {
  if (!(0, import_node_fs3.existsSync)(file)) return void 0;
  try {
    return JSON.parse((0, import_node_fs3.readFileSync)(file, "utf8"));
  } catch {
    return void 0;
  }
}
function storyDeployVerified(tddDir, featureId, storyId) {
  const fdir = findFeatureDir(tddDir, featureId);
  if (!fdir) return false;
  return deployEvidencePasses(readDeployEvidence((0, import_node_path4.join)(fdir, "stories", storyId, "deploy-evidence.json")));
}

// scripts/tdd/supersession.ts
init_cjs_shims();
var fs5 = __toESM(require("fs"), 1);
var import_node_path5 = require("path");
function supersededTestsJson(tdd, feature, story, ac) {
  return (0, import_node_path5.join)(cycleDir(tdd, feature, story, ac), "superseded-tests.json");
}
function readSupersededTests(tdd, feature, story, ac) {
  const file = supersededTestsJson(tdd, feature, story, ac);
  if (!fs5.existsSync(file)) return void 0;
  try {
    const parsed = JSON.parse(fs5.readFileSync(file, "utf8"));
    if (!Array.isArray(parsed.tests) || parsed.tests.length === 0) return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function greenFailureJson(tdd, feature, story, ac) {
  return (0, import_node_path5.join)(cycleDir(tdd, feature, story, ac), "green-failure.json");
}
function readGreenFailure(tdd, feature, story, ac) {
  const file = greenFailureJson(tdd, feature, story, ac);
  if (!fs5.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs5.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function needsGreenAssess(tdd, feature, story, ac) {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== void 0 && gf.assessed !== true;
}
function hasPendingRegressionFix(tdd, feature, story, ac) {
  const gf = readGreenFailure(tdd, feature, story, ac);
  return gf !== void 0 && gf.assessed === true && typeof gf.fixDirective === "string" && gf.fixDirective.length > 0 && gf.repairAttempted !== true;
}

// scripts/git/commits.ts
init_cjs_shims();

// scripts/tdd/cycle-record.ts
function readStoryItems(tddDir, featureId, story) {
  const file = storyTestListJson(tddDir, featureId, story);
  if (!(0, import_fs7.existsSync)(file)) {
    throw new Error(`per-story test-list not found for ${featureId}/${story} at ${file}`);
  }
  const data = JSON.parse((0, import_fs7.readFileSync)(file, "utf8"));
  return Array.isArray(data.items) ? data.items : [];
}
function storyCycles(tddDir, featureId, story) {
  const base = (0, import_path7.join)(cyclesRootDir(tddDir), featureId, story);
  if (!(0, import_fs7.existsSync)(base)) return [];
  const out = [];
  for (const acDir of (0, import_fs7.readdirSync)(base)) {
    const dir = (0, import_path7.join)(base, acDir);
    try {
      if (!(0, import_fs7.statSync)(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const f of (0, import_fs7.readdirSync)(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse((0, import_fs7.readFileSync)((0, import_path7.join)(dir, f), "utf8")));
      } catch {
      }
    }
  }
  return out;
}
function storyTestProgress(tddDir, featureId, story) {
  let items = [];
  try {
    items = readStoryItems(tddDir, featureId, story);
  } catch {
    items = [];
  }
  const cycles = storyCycles(tddDir, featureId, story);
  const cycledTestIds = new Set(cycles.flatMap((c) => coveredTestIds(c)));
  const greenTestIds = new Set(cycles.filter((c) => c.green_at).flatMap((c) => coveredTestIds(c)));
  const pending = items.filter((i) => !cycledTestIds.has(i.id));
  const openRed = cycles.filter((c) => c.red_at && !c.green_at);
  const allGreen = items.length > 0 && items.every((i) => greenTestIds.has(i.id));
  return { total: items.length, pending, openRed, allGreen };
}
function pendingItemKind(tddDir, featureId, story) {
  return storyTestProgress(tddDir, featureId, story).pending[0]?.kind;
}
var DEFAULT_BATCH_CAP = 3;
function nextPendingBatch(tddDir, featureId, story, cap = DEFAULT_BATCH_CAP) {
  const effCap = cap > 0 ? cap : DEFAULT_BATCH_CAP;
  const pending = storyTestProgress(tddDir, featureId, story).pending;
  if (pending.length === 0) return [];
  const layerOf = (acId) => readAcLayer2(tddDir, featureId, acId) ?? "_nolayer";
  const headLayer = layerOf(pending[0].ac_id);
  return pending.filter((it) => layerOf(it.ac_id) === headLayer).slice(0, effCap);
}
function readReview(tddDir, featureId, story, acId) {
  const f = acReviewJson(tddDir, featureId, story, acId);
  if (!(0, import_fs7.existsSync)(f)) return {};
  try {
    return JSON.parse((0, import_fs7.readFileSync)(f, "utf8"));
  } catch {
    return {};
  }
}
function acReviewStates(tddDir, featureId, story) {
  let items = [];
  try {
    items = readStoryItems(tddDir, featureId, story);
  } catch {
    items = [];
  }
  const greenTestIds = new Set(
    storyCycles(tddDir, featureId, story).filter((c) => c.green_at).flatMap((c) => coveredTestIds(c))
  );
  const acOrder = [];
  const acTests = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (!acTests.has(it.ac_id)) {
      acTests.set(it.ac_id, []);
      acOrder.push(it.ac_id);
    }
    acTests.get(it.ac_id).push(it.id);
  }
  return acOrder.map((acId) => {
    const tests = acTests.get(acId);
    const r = readReview(tddDir, featureId, story, acId);
    return {
      acId,
      allTestsGreen: tests.length > 0 && tests.every((t) => greenTestIds.has(t)),
      reviewed: Boolean(r.reviewed_at),
      refactorRequested: Boolean(r.refactor_requested),
      refactored: Boolean(r.refactored_at)
    };
  });
}
function firstReviewPendingAc(tddDir, featureId, story) {
  return acReviewStates(tddDir, featureId, story).find((a) => a.allTestsGreen && !a.reviewed)?.acId ?? null;
}
function firstRefactorPendingAc(tddDir, featureId, story) {
  return acReviewStates(tddDir, featureId, story).find((a) => a.reviewed && a.refactorRequested && !a.refactored)?.acId ?? null;
}

// scripts/tdd/escalation.ts
var BLOCKING_SMELLS = /* @__PURE__ */ new Set([
  "test-list-drift",
  "cycle-stall",
  "boundary-violation",
  "test-deletion-attempt",
  // A missing kit-owned scaffold piece (e.g. the E2E conftest/live_server) must
  // halt to the HIL, not let the build fabricate it. The driver-wrote-its-own-
  // conftest defect (2026-06-11 smoke) traced to this not being blocking.
  "scaffold-defect",
  // Non-independent ACs (one AC's `then` implied by another) make a faithful RED
  // impossible. Flagged by the test-strategist at the design gate so it halts
  // BEFORE a build cycle, not mid-build as a cycle-stall (the 2026-06-11 AC2/AC3
  // overlap that stalled S1).
  "ac-overlap",
  // The boundary/routes layer touching persistence directly (a fat controller),
  // instead of delegating to a service + repository. A build-level structural
  // defect; the Navigator flags it in REVIEW and the layering fitness test
  // defends it. Build-level (not spec-level), so it hard-halts to the HIL rather
  // than routing to a design author.
  "layering-violation",
  // The rendered UI does not USE the design tokens at the element level (hardcoded
  // hex/px, a missing ia.md data-testid seam, or an action with no feedback), even
  // though the :root tokens exist. The UX Designer flags it in REVIEW and the
  // element-level design-adherence checks defend it. Build-level (a UI-quality
  // defect to refactor), so it hard-halts to the HIL rather than routing to an author.
  "ux-adherence"
]);
function escalationId(parts) {
  return [parts.source, parts.feature_id, parts.story_id, parts.ac_id].filter(Boolean).join("__").replace(/[^A-Za-z0-9_.-]/g, "-");
}
function writeEscalation(tddDir, esc) {
  const id = esc.id ?? escalationId(esc);
  const file = escalationFile(tddDir, id);
  const existing = readEscalationFile(file);
  if (existing && !existing.resolved_at) return existing;
  const full = {
    id,
    source: esc.source,
    reason: esc.reason,
    ...esc.feature_id ? { feature_id: esc.feature_id } : {},
    ...esc.story_id ? { story_id: esc.story_id } : {},
    ...esc.ac_id ? { ac_id: esc.ac_id } : {},
    raised_at: esc.raised_at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  fs6.mkdirSync(escalationsDir(tddDir), { recursive: true });
  fs6.writeFileSync(file, JSON.stringify(full, null, 2) + "\n", "utf8");
  return full;
}
function readEscalationFile(file) {
  if (!fs6.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs6.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function readEscalations(tddDir) {
  const dir = escalationsDir(tddDir);
  if (!fs6.existsSync(dir)) return [];
  const out = [];
  for (const f of fs6.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const e = readEscalationFile(`${dir}/${f}`);
    if (e) out.push(e);
  }
  return out;
}
function escalationsFromSmells(tddDir, featureId) {
  const log = readSmellsLog(tddDir);
  return log.detected.filter((d) => !d.resolution && BLOCKING_SMELLS.has(d.smell)).filter((d) => {
    if (d.smell !== "cycle-stall" || !featureId || !d.story_id) {
      return true;
    }
    return pendingItemKind(tddDir, featureId, d.story_id) !== "fitness";
  }).map((d) => ({
    id: escalationId({ source: `smell:${d.smell}`, feature_id: featureId, story_id: d.story_id }),
    source: `smell:${d.smell}`,
    reason: `blocking smell "${d.smell}": ${d.detail}`,
    ...featureId ? { feature_id: featureId } : {},
    ...d.story_id ? { story_id: d.story_id } : {},
    ...d.ac_id ? { ac_id: d.ac_id } : {},
    raised_at: d.detected_at
  }));
}
function firstPendingEscalation(tddDir, featureId) {
  const explicit = readEscalations(tddDir).filter((e) => !e.resolved_at);
  const scoped = featureId ? explicit.filter((e) => !e.feature_id || e.feature_id === featureId) : explicit;
  if (scoped.length > 0) {
    return [...scoped].sort((a, b) => a.raised_at < b.raised_at ? -1 : 1)[0];
  }
  const fromSmells = escalationsFromSmells(tddDir, featureId);
  return fromSmells.length > 0 ? fromSmells.sort((a, b) => a.raised_at < b.raised_at ? -1 : 1)[0] : null;
}

// scripts/tdd/workflow-phase.ts
init_cjs_shims();
var fs7 = __toESM(require("fs"), 1);
var TERMINAL_PHASES = /* @__PURE__ */ new Set(["done", "shipped"]);
function writeWorkflowPhase(tddDir, phase) {
  const file = workflowStateJson(tddDir);
  let state = {};
  if (fs7.existsSync(file)) {
    try {
      state = JSON.parse(fs7.readFileSync(file, "utf8"));
    } catch {
      state = {};
    }
  }
  state.phase = phase;
  fs7.mkdirSync(tddDir, { recursive: true });
  fs7.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}
function resetStaleTerminalPhase(tddDir) {
  const file = workflowStateJson(tddDir);
  if (!fs7.existsSync(file)) return false;
  let state;
  try {
    state = JSON.parse(fs7.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  if (typeof state.phase === "string" && TERMINAL_PHASES.has(state.phase)) {
    delete state.phase;
    fs7.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
    return true;
  }
  return false;
}

// scripts/tdd/orchestrator-effects.ts
init_cjs_shims();
var fs10 = __toESM(require("fs"), 1);
var import_node_path6 = require("path");

// scripts/tdd/orchestrator-derive.ts
init_cjs_shims();
function storyView(id, e, probe) {
  const gateApproved = e.gate?.status === "approved";
  const accepted = e.acceptance?.decision === "accepted" || e.status === "done";
  return {
    gateApproved,
    // The gate record exists once the story has been surfaced for review;
    // awaiting-gate is the pre-record surfaced state.
    gateSurfaced: e.gate != null || e.status === "awaiting-gate",
    design: {
      hasAcs: probe.hasAcs(id),
      architectAnnotated: probe.architectAnnotated(id),
      testListReady: probe.testListReady(id)
    },
    build: {
      // An experiment that was discarded is no longer cut (a fresh one is cut
      // on revise); merged/active both count as cut.
      experimentCut: e.experiment != null && e.experiment.status !== "discarded",
      testsWritten: probe.testsWritten(id),
      codeWritten: probe.codeWritten(id),
      reviewAc: probe.reviewPendingAc(id),
      refactorAc: probe.refactorPendingAc(id),
      assessGreenAc: probe.assessGreenFailureAc(id),
      repairRegressionAc: probe.repairRegressionFixAc(id),
      awaitingAcceptance: e.status === "awaiting-acceptance",
      deployVerified: probe.storyDeployVerified(id),
      accepted
    }
  };
}
function deriveDriveState(pipeline, probe, ctx) {
  const stories = {};
  for (const [id, entry] of Object.entries(pipeline.stories)) {
    stories[id] = storyView(id, entry, probe);
  }
  const storyOrder = ctx.storyOrder ?? Object.keys(pipeline.stories);
  const breakdownDone = ctx.breakdownDone || storyOrder.length > 0;
  return {
    phase: ctx.phase,
    planning: ctx.planning,
    deploy: ctx.deploy,
    promote: ctx.promote,
    breakdownDone,
    storyOrder,
    stories,
    buildActive: pipeline.build_active,
    escalation: probe.pendingEscalation()
  };
}
function driverPhaseForTdd(tddPhase) {
  switch (tddPhase) {
    case "planning":
      return "planning";
    case "deploy":
      return "deploy";
    case "promote":
      return "promote";
    case "shipped":
    case "done":
      return "done";
    default:
      return "feature";
  }
}

// scripts/tdd/orchestrator-probe.ts
init_cjs_shims();
var fs9 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);

// scripts/tdd/gates.ts
init_cjs_shims();
var import_fs8 = require("fs");
var import_path8 = require("path");
var GATES_SCHEMA_VERSION = 1;
var GATE_STATUSES = ["open", "approved", "superseded", "withdrawn"];
function defaultGatesState(featureId) {
  return {
    feature_id: featureId,
    schema_version: GATES_SCHEMA_VERSION,
    gates: {
      spec: { status: "open", history: [] },
      plan: { status: "open", history: [] },
      test_list: { status: "open", history: [] },
      promote: { status: "open", history: [] },
      deploy: { status: "open", history: [] }
    }
  };
}
function readGates(featureId, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, featureId);
  if (!(0, import_fs8.existsSync)(file)) {
    return defaultGatesState(featureId);
  }
  const raw = (0, import_fs8.readFileSync)(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`gates.json at ${file} is not valid JSON: ${cause}`);
  }
  return validateGatesState(parsed, file);
}
function gatesFilePath(tddDir, featureId) {
  return (0, import_path8.join)(requireFeatureDir(tddDir, featureId), "gates.json");
}
function validateGatesState(parsed, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file} is not an object`);
  }
  const obj = parsed;
  if (typeof obj.feature_id !== "string" || obj.feature_id.length === 0) {
    throw new Error(`gates.json at ${file}: missing or invalid feature_id`);
  }
  if (typeof obj.schema_version !== "number") {
    throw new Error(`gates.json at ${file}: missing or invalid schema_version`);
  }
  if (typeof obj.gates !== "object" || obj.gates === null) {
    throw new Error(`gates.json at ${file}: missing or invalid gates`);
  }
  const gates = obj.gates;
  const out = {
    spec: validateGateRecord(gates.spec, "spec", file),
    plan: validateGateRecord(gates.plan, "plan", file),
    test_list: validateGateRecord(gates.test_list, "test_list", file),
    promote: validateGateRecord(gates.promote, "promote", file),
    // The deploy gate (working-software) was added after the original four.
    // A gates.json written before it lacks the key, so backfill a default-open
    // record rather than reject the file (forward-compatible read).
    deploy: gates.deploy !== void 0 ? validateGateRecord(gates.deploy, "deploy", file) : { status: "open", history: [] }
  };
  return {
    feature_id: obj.feature_id,
    schema_version: obj.schema_version,
    gates: out
  };
}
function validateGateRecord(parsed, gateName, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file}: gate ${gateName} is not an object`);
  }
  const obj = parsed;
  const status = obj.status;
  if (typeof status !== "string" || !GATE_STATUSES.includes(status)) {
    throw new Error(
      `gates.json at ${file}: gate ${gateName} has invalid status (${String(status)}); expected one of ${GATE_STATUSES.join(", ")}`
    );
  }
  const history = obj.history;
  if (history !== void 0 && !Array.isArray(history)) {
    throw new Error(`gates.json at ${file}: gate ${gateName} history must be an array`);
  }
  return {
    status,
    approver: typeof obj.approver === "string" ? obj.approver : void 0,
    approved_at: typeof obj.approved_at === "string" ? obj.approved_at : void 0,
    artifact_hashes: obj.artifact_hashes && typeof obj.artifact_hashes === "object" ? obj.artifact_hashes : void 0,
    withdrawal_reason: typeof obj.withdrawal_reason === "string" ? obj.withdrawal_reason : void 0,
    history: history ?? []
  };
}

// scripts/lakebase/scm-workflow-state.ts
init_cjs_shims();
var fs8 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var SCM_STATES = [
  "scaffold-complete",
  "feature-claimed",
  "pr-ready",
  "ci-green",
  "merged"
];
var STATE_INDEX = SCM_STATES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {}
);
var STATE_FILE_REL = ".lakebase/workflow-state.json";
function stateFilePath(projectDir) {
  return path3.join(projectDir, STATE_FILE_REL);
}
function readWorkflowState(projectDir) {
  const p = stateFilePath(projectDir);
  if (!fs8.existsSync(p)) return null;
  const raw = fs8.readFileSync(p, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse ${STATE_FILE_REL}: ${e.message}`
    );
  }
  const result = validateWorkflowState(parsed);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `Invalid ${STATE_FILE_REL}:
${summary}

Fix the file or delete it to re-init.`
    );
  }
  return result.value;
}
function validateWorkflowState(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "must be an object" }]
    };
  }
  const v = value;
  if (v.version !== 1) {
    errors.push({ path: "version", message: `must be 1, got ${String(v.version)}` });
  }
  if (typeof v.state !== "string" || !SCM_STATES.includes(v.state)) {
    errors.push({
      path: "state",
      message: `must be one of ${SCM_STATES.join(" | ")}`
    });
  }
  if (v.tier_topology !== 1 && v.tier_topology !== 2 && v.tier_topology !== 3) {
    errors.push({
      path: "tier_topology",
      message: "must be 1, 2, or 3"
    });
  }
  if (typeof v.project_id !== "string" || v.project_id.length === 0) {
    errors.push({
      path: "project_id",
      message: "must be a non-empty string"
    });
  }
  const stringFields = [
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at",
    "$schema"
  ];
  for (const key of stringFields) {
    if (v[key] === void 0) continue;
    if (typeof v[key] !== "string" || v[key].length === 0) {
      errors.push({
        path: key,
        message: "must be a non-empty string when present"
      });
    }
  }
  const requiredForState = {
    "scaffold-complete": [],
    "feature-claimed": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at"
    ],
    "pr-ready": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at"
    ],
    "ci-green": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at"
    ],
    merged: [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at",
      "merged_at"
    ]
  };
  if (typeof v.state === "string" && SCM_STATES.includes(v.state)) {
    for (const key of requiredForState[v.state]) {
      if (v[key] === void 0) {
        errors.push({
          path: key,
          message: `required when state is "${v.state}"`
        });
      }
    }
  }
  const allowedKeys = /* @__PURE__ */ new Set([
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      errors.push({ path: key, message: "unknown property" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: v };
}

// scripts/tdd/orchestrator-probe.ts
function storyCycles2(tddDir, featureId, story) {
  const base = path4.join(cyclesRootDir(tddDir), featureId, story);
  if (!fs9.existsSync(base)) return [];
  const out = [];
  for (const acDir of fs9.readdirSync(base)) {
    const dir = path4.join(base, acDir);
    let isDir = false;
    try {
      isDir = fs9.statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    for (const f of fs9.readdirSync(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(fs9.readFileSync(path4.join(dir, f), "utf8")));
      } catch {
      }
    }
  }
  return out;
}
function readJson(file) {
  if (!fs9.existsSync(file)) return void 0;
  try {
    return JSON.parse(fs9.readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
}
function readDriveContext(tddDir, featureId, projectDir) {
  const ws = readJson(workflowStateJson(tddDir));
  const tddPhase = typeof ws?.phase === "string" ? ws.phase : "feature";
  const spec = readJson(featureSpecJson(tddDir, featureId));
  const proposed = spec !== void 0;
  const breakdownDone = Array.isArray(spec?.stories) && spec.stories.length > 0;
  const requestsAuthored = fs9.existsSync(featureRequestMd(tddDir, featureId));
  const deployed = fs9.existsSync(featureDeployEvidenceJson(tddDir, featureId));
  const gateApproved = readGateApproved(featureId, tddDir, "deploy");
  const proj = projectDir ?? path4.dirname(tddDir);
  let scmState;
  try {
    scmState = readWorkflowState(proj)?.state;
  } catch {
    scmState = void 0;
  }
  const atOrPast = (target) => {
    if (!scmState) return false;
    const i = SCM_STATES.indexOf(scmState);
    const t = SCM_STATES.indexOf(target);
    return i >= 0 && t >= 0 && i >= t;
  };
  const promote = {
    prReady: atOrPast("pr-ready"),
    ciGreen: atOrPast("ci-green"),
    prApproved: readGateApproved(featureId, tddDir, "promote"),
    merged: scmState === "merged"
  };
  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    planning: { proposed, estimated: hasEstimates(tddDir), requestsAuthored },
    deploy: { deployed, gateApproved },
    promote
  };
}
function readGateApproved(featureId, tddDir, gate) {
  try {
    return readGates(featureId, { tddDir }).gates[gate].status === "approved";
  } catch {
    return false;
  }
}
function diskArtifactProbe(tddDir, featureId, buildActive) {
  return {
    hasAcs(story) {
      return storyAcIds(tddDir, featureId, story).length > 0;
    },
    architectAnnotated(story) {
      const acs = storyAcIds(tddDir, featureId, story);
      if (acs.length === 0) return false;
      const everyAcNoted = acs.every((ac) => readAcArchitecturalNotes(tddDir, featureId, ac) !== void 0);
      return everyAcNoted && fs9.existsSync(architectureJson(tddDir, featureId));
    },
    testListReady(story) {
      const file = storyTestListJson(tddDir, featureId, story);
      if (!fs9.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs9.readFileSync(file, "utf8"));
        return Array.isArray(data.items) && data.items.length > 0;
      } catch {
        return false;
      }
    },
    // The build loop is TEST-LIST-DRIVEN: the Navigator/Driver hand off ONE test
    // at a time (write RED -> make GREEN) until EVERY test-list item is green.
    // `testsWritten` = "the Navigator has nothing to write right now" (a RED
    // already awaits the Driver, OR all tests are green); `codeWritten` = "every
    // test-list item has a GREEN cycle". With nextBuildAction's order
    // (!testsWritten -> navigator; !codeWritten -> driver) this yields the
    // interleaved per-test handoff: RED T1 -> GREEN T1 -> RED T2 -> ... Without
    // it the loop advanced after a single test and stalled at await-acceptance
    // with the rest of the list unbuilt (the live stall).
    testsWritten(story) {
      const p = storyTestProgress(tddDir, featureId, story);
      if (p.total === 0) {
        return storyCycles2(tddDir, featureId, story).some((c) => Boolean(c.red_at));
      }
      return p.openRed.length > 0 || p.allGreen;
    },
    codeWritten(story) {
      const p = storyTestProgress(tddDir, featureId, story);
      if (p.total === 0) {
        const reds = storyCycles2(tddDir, featureId, story).filter((c) => Boolean(c.red_at));
        return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
      }
      return p.allGreen;
    },
    reviewPendingAc(story) {
      return firstReviewPendingAc(tddDir, featureId, story);
    },
    refactorPendingAc(story) {
      return firstRefactorPendingAc(tddDir, featureId, story);
    },
    assessGreenFailureAc(story) {
      let acId;
      try {
        acId = storyTestProgress(tddDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      if (!acId) return null;
      return needsGreenAssess(tddDir, featureId, story, acId) ? acId : null;
    },
    repairRegressionFixAc(story) {
      let acId;
      try {
        acId = storyTestProgress(tddDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = void 0;
      }
      if (!acId) return null;
      return hasPendingRegressionFix(tddDir, featureId, story, acId) ? acId : null;
    },
    storyDeployVerified(story) {
      return storyDeployVerified(tddDir, featureId, story);
    },
    pendingEscalation() {
      const e = firstPendingEscalation(tddDir, featureId);
      if (!e) return null;
      const base = {
        id: e.id,
        source: e.source,
        reason: e.reason,
        ...e.story_id ? { story_id: e.story_id } : {}
      };
      if (e.source.startsWith("smell:")) {
        const name = e.source.slice("smell:".length);
        const story = e.story_id ?? buildActive ?? void 0;
        if (isBuildRefactorRoutableSmell(name) && story && firstRefactorPendingAc(tddDir, featureId, story)) {
          return null;
        }
        const spec = specLevelSmell(name);
        if (spec && story && priorReviseCount(tddDir, name, story) < 1) {
          base.routable = { story, owning_role: spec.owning_role, gate: spec.gate_to_rerun };
        }
      }
      return base;
    }
  };
}

// scripts/tdd/story-pipeline.ts
init_cjs_shims();
var import_fs9 = require("fs");
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(tddDir, featureId) {
  return pipelineJson(tddDir, featureId);
}
function readPipeline(tddDir, featureId) {
  const p = pipelinePath(tddDir, featureId);
  if (!(0, import_fs9.existsSync)(p)) return initPipeline(featureId);
  return JSON.parse((0, import_fs9.readFileSync)(p, "utf8"));
}

// scripts/tdd/architecture-conventions.ts
init_cjs_shims();
var import_fs10 = require("fs");
function readConventions(tddDir) {
  const f = architectureConventionsJson(tddDir);
  if (!(0, import_fs10.existsSync)(f)) return void 0;
  try {
    return JSON.parse((0, import_fs10.readFileSync)(f, "utf8"));
  } catch {
    return void 0;
  }
}

// scripts/tdd/orchestrator-effects.ts
var UI_TRACK_PROPOSE = ` UI track is ON: this product has a user-facing UI (a design-brief.md is part of intake), so every user-facing capability must be deliverable end to end as an E2E story, a real browser/screen interaction a user performs, not merely an API. Frame each candidate as a user-facing increment and note which need an E2E (UI) story.`;
var UI_TRACK_BREAKDOWN = ` UI track is ON: decompose into stories that include the E2E (UI) story for each user-facing capability (a screen the user interacts with), not API-only stories.`;
var UI_TRACK_BUILD = ` UI track is ON: the UI must adhere to the project design guide at .tdd/design/design-guide.md (+ the design-guide.json tokens). Build to it.`;
var AGENT_TERSE_SUFFIX = ` Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation. Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that output is wasted latency. The files on disk are the deliverable, not your prose.`;
function storyStubScope(tddDir, featureId, storyId) {
  try {
    const stub = JSON.parse(fs10.readFileSync(storyJson(tddDir, featureId, storyId), "utf8"));
    const parts = [
      stub.asA ? `As a ${stub.asA}` : "",
      stub.iWantTo ? `I want to ${stub.iWantTo}` : "",
      stub.soThat ? `so that ${stub.soThat}` : ""
    ].filter(Boolean);
    return parts.length ? ` The story: ${parts.join(", ")}.` : "";
  } catch {
    return "";
  }
}
function reviewRubric(tddDir, featureId, story, ac) {
  const parts = [];
  const layer = readAcLayer(tddDir, featureId, ac);
  if (layer) parts.push(`layer=${layer}`);
  try {
    const arch = JSON.parse(fs10.readFileSync(architectureJson(tddDir, featureId), "utf8"));
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && (n.applies_to === story || n.applies_to === featureId)
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
  }
  if (layer === "E2E") {
    try {
      const dg = JSON.parse(fs10.readFileSync(designGuideJson(tddDir), "utf8"));
      const groups = Object.keys(dg.tokens ?? dg);
      if (groups.length) parts.push(`design-token groups, ${groups.join(", ")}`);
    } catch {
    }
  }
  return parts.length ? ` RUBRIC (pre-extracted; judge against THIS) :: ${parts.join(" | ")}.` : "";
}
function nextPendingTestDirective(tddDir, featureId, story, loop, cap) {
  if (loop === "hybrid-a") {
    let batch = [];
    try {
      batch = nextPendingBatch(tddDir, featureId, story, cap ?? DEFAULT_BATCH_CAP);
    } catch {
      batch = [];
    }
    if (batch.length === 0) {
      return `Write the next failing tests (RED) for story ${story}: the next un-cycled layer-batch in the test list.`;
    }
    const list = batch.map((b) => `${b.id} [ac ${b.ac_id}]: "${b.description}"`).join("; ");
    return `Write the failing tests (RED) for story ${story}'s next layer-batch, EXACTLY these ${batch.length} item(s), in order: ${list}. Write ALL of them this turn and ONLY these (they share one layer/runner); do NOT skip ahead to another layer, do NOT add or drop items, the orchestration stamps ONE batch RED cycle for exactly these ids, and any mismatch is a defect.`;
  }
  let next;
  try {
    next = storyTestProgress(tddDir, featureId, story).pending[0];
  } catch {
    next = void 0;
  }
  if (!next) {
    return `Write the next failing test (RED) for story ${story}: the next un-cycled item in the test list.`;
  }
  return `Write EXACTLY ONE failing test (RED) for story ${story}: the next test in order, ${next.id} [ac ${next.ac_id}]: "${next.description}". Write ONLY this test. Do NOT skip ahead, do NOT combine tests, do NOT pick a different item, the orchestration stamps the RED cycle for ${next.id}, and a mismatch between the test you write and ${next.id} is a defect.`;
}
function supersededTestsDirective(tddDir, featureId, story) {
  let acId;
  try {
    const prog = storyTestProgress(tddDir, featureId, story);
    acId = (prog.openRed[0] ?? prog.pending[0])?.ac_id;
  } catch {
    acId = void 0;
  }
  if (!acId) return "";
  const sup = readSupersededTests(tddDir, featureId, story, acId);
  if (!sup) return "";
  const list = sup.tests.map((t) => `  - ${t}`).join("\n");
  return `

SUPERSEDED TESTS: this AC (${acId}) supersedes behavior encoded in PRIOR tests the Navigator flagged (${sup.reason}). The latest AC wins. You MAY refactor ONLY these flagged tests to the new behavior (alongside the production code) so the honest-GREEN verify holds:
${list}
Do NOT touch any other test; an UNflagged failing test is a genuine regression that must stay red and escalate.`;
}
function regressionRepairDirective(tddDir, featureId, story) {
  let acId;
  try {
    acId = storyTestProgress(tddDir, featureId, story).openRed[0]?.ac_id;
  } catch {
    acId = void 0;
  }
  if (!acId) return "";
  const gf = readGreenFailure(tddDir, featureId, story, acId);
  if (!gf?.fixDirective) return "";
  return `REPAIR a driver-fixable regression in AC ${acId} (story ${story}). The honest-GREEN verify against the running app FAILED and the Navigator diagnosed it as a genuine regression in the code (NOT a superseded test):
  DIAGNOSIS: ${gf.diagnosis ?? gf.summary}
  FIX: ${gf.fixDirective}
Apply that fix to the PRODUCTION code (you may not edit prior tests, this is a regression, not a supersession). Keep the AC's own tests green. This is your ONE repair attempt: if the verify still fails after it, the orchestration escalates to a human with the diagnosis.`;
}
function consumeHandback(action, featureId, tddDir) {
  const story = "story" in action ? action.story : void 0;
  const file = handbackFile(tddDir, featureId, action.role, story);
  if (!fs10.existsSync(file)) return "";
  let note = "";
  try {
    note = fs10.readFileSync(file, "utf8").trim();
    fs10.rmSync(file, { force: true });
  } catch {
    return "";
  }
  return note ? `${note}

` : "";
}
function roleTask(action, featureId, uiTrack, tddDir, build) {
  return consumeHandback(action, featureId, tddDir) + roleTaskBody(action, featureId, uiTrack, tddDir, build);
}
function architectConventionsDirective(tddDir) {
  const conventions = readConventions(tddDir);
  if (!conventions) {
    return ` This is the first feature: the layered layout you declare in architecture.json (the role -> module paths) becomes the PROJECT-WIDE convention every later feature inherits, so choose the canonical layout deliberately.`;
  }
  const layout = conventions.layers.map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`).join(", ");
  return ` REUSE the established project architecture conventions (set by ${conventions.established_by}): ${layout}. Declare the SAME role -> module paths in architecture.json, do NOT remap or rename an established layer; a divergent layout hard-blocks the spec gate and mismatches the inherited code.`;
}
function roleTaskBody(action, featureId, uiTrack, tddDir, build) {
  if ("mode" in action) {
    switch (action.mode) {
      case "propose":
        return `Propose the sprint's candidate feature breakdown for planning (feature-proposals.md).${uiTrack ? UI_TRACK_PROPOSE : ""}`;
      case "estimate":
        return `Estimate each proposed candidate feature with a t-shirt size (XS/S/M/L/XL) and write planning/estimates.json, so the Product Owner can commit a backlog that fits sprint capacity.`;
      case "author-requests":
        return `Provide the sprint's feature-requests.`;
      case "breakdown":
        return `Break feature ${featureId} down into its stories.${uiTrack ? UI_TRACK_BREAKDOWN : ""}`;
    }
  }
  if (action.role === "ux-designer") {
    return `Translate the HIL design brief (.tdd/design/design-brief.md) into the project design system: write design-guide.md (visual + interaction standards), design-guide.json (the machine-checkable tokens: typography, colors, spacing, radius, shadows, breakpoints), and ia.md (the information architecture: screens, navigation, flows). This is the project-level style guide the Navigator and Driver build the UI against; author it once from the brief + product-overview.md.`;
  }
  const s = action.story;
  switch (action.role) {
    case "spec-author":
      return `Draft the acceptance criteria for story ${s} and NOTHING else.${storyStubScope(tddDir, featureId, s)} Write ONE file per AC as acs/<AC>.json (+ optional acs/<AC>.md), and put NOTHING else in acs/ (no test lists, no -tests.json / -test-list.json, no scratch files, the spec gate validates every acs/*.json against the AC schema and rejects non-AC files). The AC id MUST match AC<n>-<slug>: AC1-create-form, AC2-form-accepts-input, ... (an "AC" prefix + a number, then a kebab slug). A bare slug id like "create-form-displays" FAILS the schema and hard-blocks the spec gate. The file's "id" field MUST equal its basename (acs/AC1-foo.json has {"id":"AC1-foo"}). Write only under story ${s}'s acs/ directory. Do not create, draft, or modify acceptance criteria for any other story in this feature, each other story is drafted in its own separate step that you are not performing now, and you will be invoked again, once per story, for the rest. Authoring more than ${s} here delays ${s} reaching its spec gate and build, and is rejected at the gate.`;
    case "architect-reviewer":
      return `Annotate AC layers and nfrs.md coverage for story ${s}. In architecture.json, make an EXPLICIT service_backed call (required): set service_backed:true if the feature persists data (a DB table/migration) or carries business logic, and then you MUST declare boundary, service, and repository layers (plus a "models" PACKAGE app/models/ , one module per domain object, NOT a flat app/models.py , when it persists entities); set false ONLY for a trivial static/read-through endpoint. A not-service_backed declaration is cross-checked , an Infra-layer AC or a migration/schema/storage NFR while service_backed is false hard-blocks the gate.${architectConventionsDirective(tddDir)}`;
    case "test-strategist": {
      const acIds = storyAcIds(tddDir, featureId, s);
      const acScope = acIds.length ? ` The story's ACs are: ${acIds.join(", ")}. Map every test's ac_id to one of these EXACT ids (verbatim, never a bare slug or an invented id), and cover each AC at least once.` : "";
      return `Produce story ${s}'s ordered tests and APPEND them to the feature master test list .tdd/features/${featureId}/test-list.json, keep every item already there for the other stories and add this story's. Do NOT author any test-list-per-story.json (the orchestration generates the per-story + per-AC views from the master).${acScope}`;
    }
    case "navigator":
      if (action.buildMode === "assess") {
        return `ASSESS a failed honest-GREEN verify for AC ${action.ac} in story ${s}. The Driver made the current test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail. Inspect which tests fail and decide:
(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode (the latest AC wins; e.g. a prior feature's test asserts an outcome this AC deliberately changes), FLAG them so the Driver may permissively refactor ONLY those:
   lakebase-tdd-cycle flag-superseded --feature ${featureId} --story ${s} --ac ${action.ac} --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir ${tddDir}
(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior; the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a bounded Driver repair turn):
   lakebase-tdd-cycle assess-regression --feature ${featureId} --story ${s} --ac ${action.ac} --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"] --tdd-dir ${tddDir}
   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration then escalates carrying your diagnosis).
Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a regression, always write a diagnosis , never nothing.`;
      }
      if (action.buildMode === "review") {
        return `REVIEW the implementation of AC ${action.ac} in story ${s} now that its tests are green.` + reviewRubric(tddDir, featureId, s, action.ac ?? "") + ` Judge the diff against the rubric: layer boundaries, naming, cross-cutting concerns, the required NFRs, and (for UI) design-token + IA adherence. The rubric above is pre-extracted from .tdd/features/${featureId}/architecture.md, .tdd/nfrs.md, and .tdd/design/design-guide.md, open those full files ONLY if you need more detail than it carries (do not re-read them by default). Write your verdict to .tdd/cycles/${featureId}/${s}/${action.ac}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`;
      }
      return `${nextPendingTestDirective(tddDir, featureId, s, build?.loop, build?.cap)}${uiTrack ? UI_TRACK_BUILD : ""}`;
    case "driver":
      if (action.buildMode === "repair") {
        return regressionRepairDirective(tddDir, featureId, s);
      }
      if (action.buildMode === "refactor") {
        return `REFACTOR AC ${action.ac} in story ${s} per the Navigator's review (.tdd/cycles/${featureId}/${s}/${action.ac}/review.json -> refactor_notes), guided by the architecture (.tdd/features/${featureId}/architecture.md), the NFRs (.tdd/nfrs.md), + design guide (.tdd/design/design-guide.md). Keep ALL tests green and do not change what the outer-boundary tests check, refactor only.`;
      }
      return (build?.loop === "hybrid-a" ? `Make the failing tests for story ${s}'s current layer-batch ALL GREEN in one pass (simplest honest code); implement until every test in the open batch passes, then run that layer's runner once.` : `Make the failing test for story ${s} GREEN (simplest honest code).`) + (uiTrack ? UI_TRACK_BUILD : "") + supersededTestsDirective(tddDir, featureId, s);
    default:
      return `Work story ${s}.`;
  }
}
var PIPELINE_BIN = "lakebase-tdd-pipeline";
var EXPERIMENT_BIN = "lakebase-tdd-experiment";
var CYCLE_BIN = "lakebase-tdd-cycle";
var HUMAN_PROXY_BIN = "lakebase-tdd-human-proxy";
var LOG_BIN = "lakebase-tdd-log";
var TEST_LIST_BIN = "lakebase-tdd-test-list";
var DEPLOY_BIN = "lakebase-tdd-deploy";
var SCM_PREPARE_PR_BIN = "lakebase-scm-prepare-pr";
var SCM_WAIT_CI_BIN = "lakebase-scm-wait-ci";
var SCM_MERGE_BIN = "lakebase-scm-merge";
var EXPERIMENT_SLUG = "exp1";
var experimentBranchName = (storyId) => sanitizeBranchName(`experiment/${storyId}-${EXPERIMENT_SLUG}`);
function commandsForAction(action, cfg) {
  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.tddDir];
  const approver = cfg.approver ?? "human-proxy";
  const deployTarget = cfg.deployTarget ?? "local";
  switch (action.kind) {
    case "invoke-role": {
      if ("mode" in action && action.role === "product-owner" && action.mode === "author-requests") {
        return [
          { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["supply-requests", "--tdd-dir", cfg.tddDir, "--approver", approver] },
          { kind: "sync-backlog", sprint: cfg.sprintName ?? "sprint" }
        ];
      }
      const BUILD_ROLES = /* @__PURE__ */ new Set(["navigator", "driver"]);
      const buildScope = cfg.buildSessionScope ?? "story";
      let resumeKey;
      if (BUILD_ROLES.has(action.role)) {
        if (buildScope === "story" && "story" in action && action.story) {
          resumeKey = `${action.role}:${action.story}`;
        }
      } else {
        resumeKey = action.role;
      }
      const buildTurn = "buildMode" in action && action.buildMode === "review" ? "review" : "buildMode" in action && action.buildMode === "refactor" ? "refactor" : action.role === "navigator" ? "red" : action.role === "driver" ? "green" : void 0;
      const isReviewTurn = action.role === "navigator" && buildTurn === "review";
      const effort = cfg.effortForTurn ? cfg.effortForTurn(action.role, buildTurn) : isReviewTurn ? cfg.reviewEffort ?? "low" : "";
      const fallbackModel = cfg.fallbackModelForRole?.(action.role);
      const maxBudgetUsd = cfg.maxBudgetUsdForRole?.(action.role);
      const claude = {
        kind: "claude",
        role: action.role,
        model: cfg.modelForRole(action.role),
        ...resumeKey !== void 0 ? { resumeKey } : {},
        ...effort && effort !== "default" ? { effort } : {},
        ...fallbackModel ? { fallbackModel } : {},
        ...typeof maxBudgetUsd === "number" ? { maxBudgetUsd } : {},
        task: roleTask(action, f, cfg.uiTrack ?? false, cfg.tddDir, {
          loop: cfg.loopGranularity,
          cap: cfg.batchCap
        }) + AGENT_TERSE_SUFFIX,
        replay: {
          mode: "mode" in action ? action.mode : void 0,
          story: "story" in action ? action.story : void 0
        }
      };
      const cmds = [claude];
      if ("mode" in action && action.role === "spec-author" && action.mode === "breakdown") {
        cmds.push({ kind: "cli", bin: PIPELINE_BIN, args: ["sync-breakdown", ...tdd] });
      }
      if (!("mode" in action) && action.role === "test-strategist") {
        cmds.push({ kind: "cli", bin: TEST_LIST_BIN, args: [cfg.tddDir, f, action.story] });
      }
      if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: ["assess-green", "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.tddDir] });
      } else if (!("mode" in action) && action.role === "navigator") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        const verb = "buildMode" in action && action.buildMode === "review" ? "review" : "begin";
        const loopFlag = verb === "begin" && cfg.loopGranularity === "hybrid-a" ? ["--loop", "hybrid-a", ...cfg.batchCap ? ["--batch-cap", String(cfg.batchCap)] : []] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.tddDir, ...loopFlag] });
      }
      if (!("mode" in action) && action.role === "driver") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        const isRepair = "buildMode" in action && action.buildMode === "repair";
        const verb = "buildMode" in action && action.buildMode === "refactor" ? "refactor" : "green";
        const repairFlag = isRepair ? ["--repair"] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.tddDir, ...repairFlag] });
      }
      const isPlanningMode = "mode" in action && (action.mode === "propose" || action.mode === "estimate");
      if (f && !isPlanningMode) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });
      return cmds;
    }
    case "surface-gate":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["surface", "--story", action.story, ...tdd] }];
    case "approve-gate":
      return [
        { kind: "cli", bin: PIPELINE_BIN, args: ["approve-gate", "--story", action.story, "--approver", approver, ...tdd] }
      ];
    case "dispatch":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["dispatch", ...tdd] }];
    case "cut-experiment":
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "cut",
            "--feature",
            f,
            "--story",
            action.story,
            "--slug",
            EXPERIMENT_SLUG,
            "--branch",
            experimentBranchName(action.story),
            "--parent",
            cfg.featureBranch ?? "",
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir
          ]
        }
      ];
    case "await-acceptance": {
      const deployCmd = `./scripts/lk lakebase-tdd-deploy --target ${deployTarget} --feature ${f} --story ${action.story} --lakebase-branch ${experimentBranchName(action.story)} --tdd-dir ${cfg.tddDir} --gate`;
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "claude",
          role: "release-engineer",
          model: cfg.modelForRole("release-engineer"),
          resumeKey: "release-engineer",
          task: `Take over as the Release Engineer for story ${action.story} of ${f}. Deploy it to the ${deployTarget} target and verify it actually serves: from the project root run exactly
  ${deployCmd}
That command starts the app, polls it reachable, runs the verify suite, and writes the deploy-evidence the acceptance gate reads. Do NOT report success without running it, the orchestration checks the evidence on disk, not your word.` + AGENT_TERSE_SUFFIX
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["await-acceptance", "--story", action.story, ...tdd] }
      ];
    }
    case "accept":
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "merge",
            "--feature",
            f,
            "--story",
            action.story,
            "--slug",
            EXPERIMENT_SLUG,
            "--experiment-branch",
            experimentBranchName(action.story),
            "--feature-branch",
            cfg.featureBranch ?? "",
            "--approver",
            approver,
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir
          ]
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["accept", "--story", action.story, "--approver", approver, ...tdd] }
      ];
    case "complete":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["complete", ...tdd] }];
    case "approve-plan-gate":
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "plan", "--approver", approver, "--tdd-dir", cfg.tddDir]
        }
      ];
    case "planning-complete":
      return [{ kind: "set-phase", phase: "discovery" }];
    case "feature-complete":
      return [{ kind: "set-phase", phase: "deploy" }];
    case "deploy":
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: ["--target", deployTarget, "--feature", f, "--project-dir", cfg.projectDir, "--tdd-dir", cfg.tddDir, "--gate"]
        }
      ];
    case "approve-deploy-gate":
      return [
        { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["--feature", f, "--gate", "deploy", "--approver", approver, "--tdd-dir", cfg.tddDir] }
      ];
    case "deploy-complete":
      return [{ kind: "set-phase", phase: "promote" }];
    case "prepare-pr":
      return [{ kind: "cli", bin: SCM_PREPARE_PR_BIN, args: ["--project-dir", cfg.projectDir] }];
    case "wait-ci":
      return [{ kind: "cli", bin: SCM_WAIT_CI_BIN, args: ["--project-dir", cfg.projectDir] }];
    case "approve-promote-gate": {
      const promoteRef = cfg.featureBranch ?? f;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--feature", f, "--gate", "promote", "--approver", approver, "--tdd-dir", cfg.tddDir, "--promote-ref", promoteRef]
        }
      ];
    }
    case "merge":
      return [
        {
          kind: "cli",
          bin: SCM_MERGE_BIN,
          args: [
            "--project-dir",
            cfg.projectDir,
            "--wait-migrate",
            "--migrate-timeout-nonfatal",
            "--migrate-timeout-sec",
            "600"
          ]
        }
      ];
    case "done":
      return [
        // Force the checkout: at `done` the feature has merged and its code is
        // committed, but the per-run .tdd/.lakebase metadata (workflow-state.json,
        // selection-log.md) is dirty + tracked, so a plain `git checkout` aborts
        // ("local changes would be overwritten"). That churn is disposable here
        // (the feature is shipped), and landing on the parent is the whole point,
        // so -f discards it and switches. Mirrors the fork-guard ignoring the same
        // metadata. (scm-merge attempts this switch too but non-fatally; this is
        // the deterministic guarantee.)
        ...cfg.parentBranch ? [{ kind: "cli", bin: "git", args: ["checkout", "-f", cfg.parentBranch] }] : [],
        { kind: "set-phase", phase: "shipped" }
      ];
    case "revise-route": {
      const smellName = action.source.startsWith("smell:") ? action.source.slice("smell:".length) : action.source;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: [
            "decide-escalation",
            "--feature",
            f,
            "--story",
            action.story,
            "--smell",
            smellName,
            "--routed-to",
            action.role,
            "--gate",
            action.gate,
            "--reason",
            action.reason,
            "--approver",
            approver,
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir
          ]
        }
      ];
    }
    case "raise-to-hil":
      return [];
    case "design-complete":
      return [];
  }
}
async function planNextAction(cfg, transition = nextTransition) {
  const state = await buildDriveEffects(cfg).readState();
  const action = transition(state);
  return { action, commands: commandsForAction(action, cfg) };
}
function buildDriveEffects(cfg) {
  return {
    async readState() {
      const pipeline = readPipeline(cfg.tddDir, cfg.featureId);
      const probe = diskArtifactProbe(cfg.tddDir, cfg.featureId, pipeline.build_active);
      const ctx = readDriveContext(cfg.tddDir, cfg.featureId, cfg.projectDir);
      const state = deriveDriveState(pipeline, probe, ctx);
      state.uiTrack = cfg.uiTrack ?? false;
      state.designGuideReady = fs10.existsSync(designGuideJson(cfg.tddDir));
      return state;
    },
    async perform(action) {
      for (const cmd of commandsForAction(action, cfg)) {
        await cfg.runner.run(cmd);
      }
    },
    onAction: cfg.onAction,
    // Hand-back delivery: when a role's prior turn failed its expectation
    // contract, write the violation detail where THAT role's next prompt will
    // consume it (consumeHandback in roleTask), so the retry is informed.
    onHandback(handoff, detail) {
      const file = handbackFile(cfg.tddDir, cfg.featureId, handoff.responder, handoff.story);
      try {
        fs10.mkdirSync((0, import_node_path6.dirname)(file), { recursive: true });
        fs10.writeFileSync(file, `${detail}
`, "utf8");
      } catch {
      }
    }
  };
}

// scripts/tdd/orchestrator-sprint.ts
init_cjs_shims();

// scripts/tdd/sprint-gates.ts
init_cjs_shims();
var import_node_fs4 = require("fs");

// scripts/tdd/gate-hash.ts
init_cjs_shims();

// scripts/tdd/artifact-conformance.ts
init_cjs_shims();

// scripts/tdd/sprint-gates.ts
var SPRINT_GATES_SCHEMA_VERSION = 1;
function defaultSprintGatesState(sprint) {
  return {
    sprint,
    schema_version: SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: "open", history: [] } }
  };
}
function sprintGatesFile(tddDir, sprint) {
  return sprintGatesJson(tddDir, sprint);
}
function readSprintGates(sprint, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = sprintGatesFile(tddDir, sprint);
  if (!(0, import_node_fs4.existsSync)(file)) return defaultSprintGatesState(sprint);
  let parsed;
  try {
    parsed = JSON.parse((0, import_node_fs4.readFileSync)(file, "utf8"));
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`sprint gates.json at ${file} is not valid JSON: ${cause}`);
  }
  const plan = parsed.gates?.plan ?? { status: "open", history: [] };
  return {
    sprint,
    schema_version: parsed.schema_version ?? SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: plan.status, approver: plan.approver, approved_at: plan.approved_at, artifact_hashes: plan.artifact_hashes, history: plan.history ?? [] } }
  };
}

// scripts/tdd/orchestrator-sprint.ts
var fs11 = __toESM(require("fs"), 1);
function deriveSprintPlanningState(tddDir, sprint, opts = {}) {
  const proposed = fs11.existsSync(featureProposalsMd(tddDir));
  const estimated = hasEstimates(tddDir);
  const backlog = readBacklog(tddDir, sprint).features;
  const requestsAuthored = backlog.length > 0 && backlog.every((f) => hasFeatureRequest(tddDir, f.id));
  let gateApproved = false;
  try {
    gateApproved = readSprintGates(sprint, { tddDir }).gates.plan.status === "approved";
  } catch {
    gateApproved = false;
  }
  return {
    phase: "planning",
    planning: { proposed, estimated, requestsAuthored, gateApproved, skipSizing: opts.skipSizing ?? false },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null
  };
}
async function runSprint(effects) {
  const planning = await effects.drivePlanning();
  if (planning.pendingGate) return { features: [], pendingGate: planning.pendingGate };
  const features = await effects.readBacklog();
  for (let i = 0; i < features.length; i++) {
    const featureId = features[i];
    effects.onFeature?.(featureId, i);
    await effects.claimFeature(featureId);
    const driven = await effects.driveFeature(featureId);
    if (driven.pendingGate) {
      return { features, pendingGate: driven.pendingGate, pendingFeature: featureId };
    }
  }
  return { features };
}

// scripts/tdd/agent-models.ts
init_cjs_shims();
var import_fs11 = require("fs");
var import_path9 = require("path");
var RECOMMENDED_MODELS = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus",
  "release-engineer": "sonnet"
};
var ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS);
var AGENT_CONFIG_REL = (0, import_path9.join)(".lakebase", "agent-config.json");
function readAgentConfig(projectDir) {
  const p = (0, import_path9.join)(projectDir, AGENT_CONFIG_REL);
  if (!(0, import_fs11.existsSync)(p)) return void 0;
  return JSON.parse((0, import_fs11.readFileSync)(p, "utf8"));
}
function resolveModelForRole(role, projectDir) {
  const spawnable = role;
  const entry = readAgentConfig(projectDir)?.roles?.[spawnable];
  return entry?.override ?? entry?.recommended ?? RECOMMENDED_MODELS[spawnable] ?? "inherit";
}

// scripts/tdd/tdd-config.ts
init_cjs_shims();
var import_fs12 = require("fs");
var import_path10 = require("path");
var TDD_CONFIG_REL = (0, import_path10.join)(".lakebase", "tdd-config.json");
function loadTddConfig(projectDir) {
  const f = (0, import_path10.join)(projectDir, TDD_CONFIG_REL);
  if (!(0, import_fs12.existsSync)(f)) return void 0;
  try {
    return JSON.parse((0, import_fs12.readFileSync)(f, "utf8"));
  } catch {
    return void 0;
  }
}
function defaultEffort(role, turn) {
  if (role === "navigator" && turn === "review") return "low";
  return "default";
}
function resolveTddSettings(inputs) {
  const env = inputs.env ?? process.env;
  const file = loadTddConfig(inputs.projectDir);
  const legacy = readAgentConfig(inputs.projectDir);
  const models = {};
  const fallbackModels = {};
  const budgets = {};
  for (const role of ALL_AGENT_ROLES) {
    const rc = file?.roles?.[role];
    const legacyEntry = legacy?.roles?.[role];
    models[role] = rc?.model ?? legacyEntry?.override ?? legacyEntry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
    fallbackModels[role] = rc?.fallbackModel;
    budgets[role] = typeof rc?.maxBudgetUsd === "number" ? rc.maxBudgetUsd : void 0;
  }
  const effortFor = (role, turn) => {
    if (role === "navigator" && turn === "review") {
      const ev = env.LAKEBASE_TDD_REVIEW_EFFORT;
      if (ev === "default") return "default";
      if (ev) return ev;
    }
    const rc = file?.roles?.[role];
    const e = rc?.effort;
    if (typeof e === "string") return e;
    if (e && turn && e[turn]) return e[turn];
    return defaultEffort(role, turn);
  };
  const batchCapRaw = env.LAKEBASE_TDD_BATCH_CAP;
  const envBatchCap = batchCapRaw && Number.isFinite(Number(batchCapRaw)) ? Math.floor(Number(batchCapRaw)) : void 0;
  const build = {
    loopGranularity: env.LAKEBASE_TDD_LOOP === "hybrid-a" ? "hybrid-a" : file?.build?.loopGranularity ?? "ac",
    batchCap: envBatchCap ?? file?.build?.batchCap,
    sessionScope: env.LAKEBASE_TDD_BUILD_SESSION === "cycle" ? "cycle" : file?.build?.sessionScope ?? "story"
  };
  const project = {
    uiTrack: env.LAKEBASE_TDD_UI === "1" ? true : env.LAKEBASE_TDD_UI === "0" ? false : file?.project?.uiTrack ?? false,
    gates: file?.project?.gates ?? "proxy",
    deployTarget: file?.project?.deployTarget ?? "local"
  };
  const plan = { sizing: file?.plan?.sizing ?? true };
  return { models, fallbackModels, budgets, effortFor, build, plan, project };
}

// scripts/tdd/claude-usage.ts
init_cjs_shims();
function numOr(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function usageFromResultEvent(ev) {
  if (!ev || ev.type !== "result" || !ev.usage) return void 0;
  const u = ev.usage;
  const usage = {
    inputTokens: numOr(u.input_tokens, 0),
    outputTokens: numOr(u.output_tokens, 0)
  };
  if (typeof u.cache_read_input_tokens === "number") usage.cacheReadTokens = u.cache_read_input_tokens;
  if (typeof u.cache_creation_input_tokens === "number") usage.cacheCreationTokens = u.cache_creation_input_tokens;
  if (typeof ev.total_cost_usd === "number") usage.costUsd = ev.total_cost_usd;
  return usage;
}
function parseTurnUsage(streamJson) {
  const lines = Array.isArray(streamJson) ? streamJson : streamJson.split("\n");
  let last;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const u = usageFromResultEvent(ev);
    if (u) last = u;
  }
  return last;
}
function assistantTextFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return "";
  let ev;
  try {
    ev = JSON.parse(trimmed);
  } catch {
    return "";
  }
  if (ev.type !== "assistant" || !ev.message || !Array.isArray(ev.message.content)) return "";
  const parts = [];
  for (const block of ev.message.content) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("");
}

// scripts/tdd/context-budget.ts
init_cjs_shims();
var CONTEXT_FREE_FRACTION_REQUIRED = 0.4;
function contextWindowFor(model) {
  return /(^|[^0-9])1m([^0-9]|$)|\[1m\]/i.test(model) ? 1e6 : 2e5;
}
function turnContextTokens(u) {
  return (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheCreationTokens || 0) + (u.outputTokens || 0);
}
function resumeFitsBudget(priorContextTokens, model) {
  const window = contextWindowFor(model);
  return priorContextTokens <= window * (1 - CONTEXT_FREE_FRACTION_REQUIRED);
}

// scripts/tdd/run-config.ts
init_cjs_shims();
var import_fs13 = require("fs");
var import_path11 = require("path");
var RUN_CONFIG_REL = (0, import_path11.join)(".tdd", "run-config.json");
function readKitRef(projectDir) {
  const f = (0, import_path11.join)(projectDir, ".lakebase", "kit-ref");
  if (!(0, import_fs13.existsSync)(f)) return void 0;
  try {
    const v = (0, import_fs13.readFileSync)(f, "utf8").trim();
    return v.length > 0 ? v : void 0;
  } catch {
    return void 0;
  }
}
function buildRunConfig(inputs) {
  const env = inputs.env ?? process.env;
  const models = {};
  for (const role of ALL_AGENT_ROLES) models[role] = inputs.modelForRole(role);
  const capRaw = env.LAKEBASE_TDD_BATCH_CAP;
  const cap = capRaw && Number.isFinite(Number(capRaw)) ? Number(capRaw) : void 0;
  const cfg = {
    version: 1,
    started_at: inputs.startedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    bound: inputs.bound ?? "full",
    gates: inputs.gates ?? "proxy",
    ui_track: Boolean(inputs.uiTrack),
    build_session_scope: inputs.buildSessionScope ?? "story",
    review_effort: inputs.reviewEffort ?? "",
    loop_granularity: env.LAKEBASE_TDD_LOOP || "ac",
    deploy_target: inputs.deployTarget ?? "local",
    models
  };
  if (cap !== void 0) cfg.batch_cap = cap;
  const label = env.LAKEBASE_TDD_RUN_LABEL;
  if (label) cfg.run_label = label;
  const kitRef = readKitRef(inputs.projectDir);
  if (kitRef) cfg.kit_ref = kitRef;
  return cfg;
}
function writeRunConfig(inputs) {
  const cfg = buildRunConfig(inputs);
  const body = JSON.stringify(cfg, null, 2) + "\n";
  try {
    (0, import_fs13.mkdirSync)(inputs.tddDir, { recursive: true });
    (0, import_fs13.writeFileSync)((0, import_path11.join)(inputs.tddDir, "run-config.json"), body);
    const recordDir = (inputs.env ?? process.env).LAKEBASE_TDD_RECORD_DIR?.trim();
    if (recordDir) {
      (0, import_fs13.mkdirSync)(recordDir, { recursive: true });
      (0, import_fs13.writeFileSync)((0, import_path11.join)(recordDir, "run-config.json"), body);
    }
  } catch {
  }
  return cfg;
}

// scripts/tdd/orchestrator-logging.ts
init_cjs_shims();
var BUILD_TURNS = /* @__PURE__ */ new Set(["red", "green", "review", "refactor"]);
function turnSettings(ctx, role, phase) {
  const turn = BUILD_TURNS.has(phase) ? phase : void 0;
  const model = ctx.modelForRole?.(role);
  const effort = ctx.effortForTurn?.(role, turn);
  return {
    ...model ? { model } : {},
    ...effort && effort !== "default" ? { effort } : {}
  };
}
function storyOf2(action) {
  return "story" in action ? action.story : void 0;
}
function orchestratorLogEvents(action, ctx = {}) {
  const feature_id = ctx.featureId;
  const story = storyOf2(action);
  const base = { role: "orchestrator", level: "info", feature_id };
  const withStory = story ? { story } : {};
  switch (action.kind) {
    case "invoke-role": {
      const role = action.role;
      const mode = "mode" in action ? action.mode : void 0;
      const buildMode = "buildMode" in action ? action.buildMode : void 0;
      const ac = "ac" in action ? action.ac : void 0;
      const phase = mode ?? buildMode ?? (role === "navigator" ? "red" : role === "driver" ? "green" : "design");
      const detail = { ...withStory, ...mode ? { mode } : {}, ...buildMode ? { buildMode } : {}, ...ac ? { ac } : {} };
      return [
        { ...base, event: "handoff", slots: { to_role: role, phase, ...detail } },
        { role, level: "info", feature_id, ...turnSettings(ctx, role, phase), event: "phase.start", slots: { phase, ...detail } }
      ];
    }
    case "surface-gate":
      return [{ ...base, event: "gate.surfaced", slots: { gate: "spec", subject: `story ${story}`, ...withStory } }];
    case "await-acceptance":
      return [
        { ...base, event: "handoff", slots: { to_role: "release-engineer", phase: "deploy", ...withStory } },
        { role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy", ...withStory } },
        { ...base, event: "gate.surfaced", slots: { gate: "acceptance", subject: `story ${story}`, ...withStory } }
      ];
    case "approve-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "spec", ...withStory } }];
    case "approve-plan-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "plan" } }];
    case "approve-deploy-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "deploy" } }];
    case "approve-promote-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "promote" } }];
    case "deploy-complete":
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "promote" } }];
    case "accept":
      return [{ ...base, event: "experiment.accepted", slots: { ...withStory } }];
    case "cut-experiment":
      return [{ ...base, event: "experiment.cut", slots: { ...withStory } }];
    case "dispatch":
      return [{ ...base, event: "phase.start", slots: { phase: "build", ...withStory } }];
    case "deploy":
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy" } }];
    case "complete":
      return [{ ...base, event: "phase.end", slots: { phase: "story", outcome: "complete", ...withStory } }];
    case "planning-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "planning", outcome: "complete" } }];
    case "design-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "design", outcome: "complete" } }];
    case "feature-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "feature", outcome: "complete" } }];
    case "raise-to-hil":
      return [
        {
          ...base,
          level: "error",
          event: "escalation.raised",
          slots: { source: action.source, reason: action.reason, ...withStory }
        }
      ];
    case "done":
      return [{ ...base, event: "phase.end", slots: { phase: "workflow", outcome: "complete" } }];
    default: {
      const k = action.kind;
      return [{ ...base, event: "reasoning", slots: { note: `orchestrator: ${k}` } }];
    }
  }
}
function describeAction(action, ctx = {}) {
  const ev = orchestratorLogEvents(action, ctx)[0];
  if (!ev) return action.kind;
  const renderCtx = {
    role: ev.role,
    ...ev.feature_id !== void 0 ? { feature_id: ev.feature_id } : {},
    ...ev.phase !== void 0 ? { phase: ev.phase } : {},
    ...ev.slots ?? {}
  };
  try {
    return renderEventMessage(ev.event, renderCtx);
  } catch {
    return ev.event;
  }
}
function makeOnAction(opts) {
  const { featureId, modelForRole, effortForTurn, ...io } = opts;
  return (action) => {
    for (const event of orchestratorLogEvents(action, { featureId, modelForRole, effortForTurn })) {
      try {
        emitAgentLogEvent(event, io);
      } catch {
      }
    }
  };
}

// scripts/tdd/drive.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--sprint":
        out.sprint = argv[++i];
        break;
      case "--project-dir":
        out.projectDir = argv[++i];
        break;
      case "--tdd-dir":
        out.tddDir = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--deploy-target":
        out.deployTarget = argv[++i];
        break;
      case "--approver":
        out.approver = argv[++i];
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--max-steps":
        out.maxSteps = Number(argv[++i]);
        break;
      case "--plan-only":
        out.planOnly = true;
        break;
      case "--only":
        out.only = argv[++i];
        break;
      case "--pause-before":
        out.pauseBefore = argv[++i];
        break;
      case "--gates":
        out.gates = argv[++i];
        break;
      // Sizing (the Architect's t-shirt-sizing / planning-poker step) is ON by
      // default. --no-sizing opts OUT: planning goes propose -> author-requests
      // with no estimate, for a backlog small enough not to need capacity sizing.
      case "--no-sizing":
      case "--no-planning-poker":
      case "--no-t-shirt-sizing":
        out.noSizing = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
function help() {
  return `lakebase-tdd-drive (deterministic orchestrator driver)

Usage:
  lakebase-tdd-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      .tdd dir (default: <project-dir>/.tdd)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --pause-before <m>   PAUSE (not stop) just before a handoff: navigator (the
                       build kickoff) | release-engineer (the deploy/verify). The
                       driver blocks for a human [Y/n], then RESUMES the same run
                       on Y , it never leaves the state machine. n re-asks. Set
                       LAKEBASE_TDD_AUTO_CONTINUE=1 to auto-confirm (non-interactive).
  --gates <mode>       proxy (default, headless: Human Proxy approves) | interactive
                       (stop AT each HITL gate so the human answers, then re-run)
  --no-sizing          Skip the Architect's t-shirt-sizing (planning-poker) step:
                       planning goes propose -> author-requests, no estimate.
                       Sizing is ON by default. Aliases: --no-planning-poker,
                       --no-t-shirt-sizing.
`;
}
function spawnCmd(bin, args, cwd) {
  return new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process9.spawn)(bin, args, { cwd, stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => code === 0 ? resolve2() : reject(new Error(`${bin} exited ${code}`)));
  });
}
function spawnClaudeStreaming(args, cwd) {
  return new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process9.spawn)("claude", args, { cwd, stdio: ["inherit", "pipe", "inherit"] });
    const lines = [];
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      lines.push(line);
      const text = assistantTextFromLine(line);
      if (text) process.stderr.write(text);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      rl.close();
      if (code !== 0) return reject(new Error(`claude exited ${code}`));
      resolve2(parseTurnUsage(lines));
    });
  });
}
var KIT_ROOT = path5.resolve(__dirname, "..", "..", "..");
var kitBinMap = null;
function resolveKitBinJs(bin) {
  if (kitBinMap === null) {
    try {
      const pkg = JSON.parse(fs12.readFileSync(path5.join(KIT_ROOT, "package.json"), "utf8"));
      kitBinMap = pkg.bin ?? {};
    } catch {
      kitBinMap = {};
    }
  }
  const rel = kitBinMap[bin];
  return rel ? path5.join(KIT_ROOT, rel) : null;
}
function execRunner(cfg) {
  const sessions = /* @__PURE__ */ new Map();
  const sessionContext = /* @__PURE__ */ new Map();
  const buildTurns = /* @__PURE__ */ new Map();
  return {
    async run(cmd) {
      if (cmd.kind === "set-phase") {
        writeWorkflowPhase(cfg.tddDir, cmd.phase);
        return;
      }
      if (cmd.kind === "sync-backlog") {
        syncBacklog(cfg.tddDir, cmd.sprint);
        return;
      }
      if (cmd.kind === "claude") {
        const replayBuildDir = process.env.LAKEBASE_TDD_REPLAY_BUILD_DIR;
        const story = cmd.replay?.story;
        if (replayBuildDir && story && (cmd.role === "navigator" || cmd.role === "driver")) {
          const turnIndex = (buildTurns.get(story) ?? 0) + 1;
          buildTurns.set(story, turnIndex);
          const replayed = replayBuildTurn({
            replayBuildDir,
            projectDir: cfg.projectDir,
            tddDir: cfg.tddDir,
            featureId: cfg.featureId,
            story,
            turnIndex
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed build turn ${turnIndex} (${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""} ${story}) from corpus (no model spawn)
`
            );
            return;
          }
          process.stderr.write(`[drive] build replay miss for ${cmd.role} turn ${turnIndex} (${story}); running the real agent
`);
        }
        const replayDir = process.env.LAKEBASE_TDD_REPLAY_DIR;
        if (replayDir && REPLAYABLE_DESIGN_ROLES.has(cmd.role)) {
          const replayed = replayDesignTurn({
            turn: { role: cmd.role, mode: cmd.replay?.mode, story: cmd.replay?.story },
            replayDir,
            tddDir: cfg.tddDir,
            featureId: cfg.featureId
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed ${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""} from corpus (no model spawn)
`
            );
            return;
          }
          process.stderr.write(`[drive] replay miss for ${cmd.role} (no corpus artifact); running the real agent
`);
        }
        const args = ["-p", cmd.task, "--agent", cmd.role, "--model", cmd.model, "--strict-mcp-config", "--output-format", "stream-json", "--verbose"];
        if (cmd.effort) args.push("--effort", cmd.effort);
        if (cmd.fallbackModel) args.push("--fallback-model", cmd.fallbackModel);
        if (typeof cmd.maxBudgetUsd === "number") args.push("--max-budget-usd", String(cmd.maxBudgetUsd));
        if (cmd.resumeKey) {
          const existing = sessions.get(cmd.resumeKey);
          const priorCtx = sessionContext.get(cmd.resumeKey) ?? 0;
          const wouldFit = resumeFitsBudget(priorCtx, cmd.model);
          if (existing && wouldFit) {
            args.push("--resume", existing);
          } else {
            if (existing && !wouldFit) {
              process.stderr.write(
                `[drive] context guard: ${cmd.role} resume context ~${priorCtx} tok would leave < ${Math.round(CONTEXT_FREE_FRACTION_REQUIRED * 100)}% free of the ${cmd.model} window; starting a FRESH session.
`
              );
            }
            const id = (0, import_node_crypto2.randomUUID)();
            sessions.set(cmd.resumeKey, id);
            sessionContext.delete(cmd.resumeKey);
            args.push("--session-id", id);
          }
        }
        const usage = await spawnClaudeStreaming(args, cfg.projectDir);
        if (usage) {
          if (cmd.resumeKey) sessionContext.set(cmd.resumeKey, turnContextTokens(usage));
          try {
            emitAgentLogEvent(
              {
                role: cmd.role,
                level: "info",
                event: "turn.usage",
                model: cmd.model,
                ...cmd.effort ? { effort: cmd.effort } : {},
                feature_id: cfg.featureId,
                slots: {
                  input_tokens: usage.inputTokens,
                  output_tokens: usage.outputTokens,
                  ...usage.cacheReadTokens !== void 0 ? { cache_read_tokens: usage.cacheReadTokens } : {},
                  ...usage.cacheCreationTokens !== void 0 ? { cache_creation_tokens: usage.cacheCreationTokens } : {},
                  ...usage.costUsd !== void 0 ? { cost_usd: usage.costUsd } : {},
                  ...cmd.replay?.story ? { story: cmd.replay.story } : {},
                  ...cmd.replay?.mode ? { phase: cmd.replay.mode } : {}
                }
              },
              { tddDir: cfg.tddDir }
            );
          } catch {
          }
        }
        return;
      }
      const js = resolveKitBinJs(cmd.bin);
      if (js) {
        await spawnCmd("node", [js, ...cmd.args], cfg.projectDir);
      } else {
        await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
      }
    }
  };
}
function buildCfg(args, featureId) {
  const projectDir = args.projectDir ?? process.cwd();
  const tddDir = args.tddDir ?? path5.join(projectDir, ".tdd");
  const scm = readWorkflowState(projectDir);
  const settings = resolveTddSettings({ projectDir });
  return {
    projectDir,
    tddDir,
    featureId,
    sprintName: args.sprint,
    instance: args.instance ?? scm?.project_id,
    featureBranch: scm?.branch,
    parentBranch: scm?.parent_branch,
    // Deploy target: the --deploy-target flag wins, else the config's default.
    deployTarget: args.deployTarget ?? settings.project.deployTarget,
    approver: args.approver ?? "human-proxy",
    // UI track: config (file or LAKEBASE_TDD_UI) decides whether the Spec Author
    // frames user-facing capabilities as E2E (browser/screen) stories vs API-only.
    uiTrack: settings.project.uiTrack,
    // P5: Navigator/Driver session scope (story warm-resume vs cycle cold-spawn).
    buildSessionScope: settings.build.sessionScope,
    // P6 (back-compat): the navigator REVIEW turn's effort, still surfaced for
    // run-config + any caller without effortForTurn. effortForTurn (below) is the
    // primary, per-role/turn resolver and supersedes this.
    reviewEffort: (() => {
      const e = settings.effortFor("navigator", "review");
      return e === "default" ? "" : e;
    })(),
    // P8b: build loop granularity + batch cap (config / env).
    loopGranularity: settings.build.loopGranularity,
    batchCap: settings.build.batchCap,
    // Unified per-role/turn model-side resolvers ("" => omit --effort).
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    fallbackModelForRole: (role) => settings.fallbackModels[role],
    maxBudgetUsdForRole: (role) => settings.budgets[role],
    modelForRole: (role) => settings.models[role] ?? resolveModelForRole(role, projectDir),
    runner: { async run() {
    } },
    onAction: composeOnAction(
      // Narrate each routing decision in plain language (DRY: the same message
      // the structured log uses), then the raw action for machine-trace parity.
      (action, i) => process.stderr.write(
        `[drive] ${String(i).padStart(3, "0")} ${describeAction(action, { featureId })}  ${JSON.stringify(action)}
`
      ),
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      // The resolvers stamp each per-turn phase.start with the model + effort it
      // ran with (right after `role`).
      makeOnAction({
        tddDir,
        featureId,
        modelForRole: (role) => settings.models[role],
        effortForTurn: (role, turn) => {
          const e = settings.effortFor(role, turn);
          return e === "default" ? "" : e;
        }
      })
    )
  };
}
function composeOnAction(...hooks) {
  return (action, i) => {
    for (const h of hooks) h(action, i);
  };
}
function makeConfirmContinue() {
  const auto = process.env.LAKEBASE_TDD_AUTO_CONTINUE === "1";
  const answerFile = process.env.LAKEBASE_TDD_GATE_ANSWER_FILE?.trim();
  const isYes = (a) => a === "" || a === "y" || a === "yes";
  return (action) => new Promise((resolve2) => {
    const label = describeAction(action);
    const prompt = `
[drive] PAUSED , continue past the ${label} handoff? [Y/n] `;
    if (auto) {
      process.stderr.write(`[drive] PAUSE gate (auto-continue): proceeding past ${label}
`);
      return resolve2();
    }
    if (answerFile) {
      process.stderr.write(`${prompt}
[drive] (awaiting answer in ${answerFile})
`);
      const poll = setInterval(() => {
        let raw;
        try {
          raw = fs12.readFileSync(answerFile, "utf8");
        } catch {
          return;
        }
        const a = raw.trim().toLowerCase();
        if (a === "") return;
        try {
          fs12.rmSync(answerFile, { force: true });
        } catch {
        }
        if (a === "y" || a === "yes") {
          clearInterval(poll);
          process.stderr.write(`[drive] resuming.
`);
          resolve2();
        } else process.stderr.write(`[drive] holding , write Y to ${answerFile} when ready.
`);
      }, 1e3);
      return;
    }
    if (process.stdin.isTTY) {
      const ask = () => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
        rl.question(prompt, (answer) => {
          rl.close();
          if (isYes(answer.trim().toLowerCase())) {
            process.stderr.write(`[drive] resuming.
`);
            resolve2();
          } else {
            process.stderr.write(`[drive] holding , answer Y when ready.
`);
            ask();
          }
        });
      };
      return ask();
    }
    process.stderr.write(
      `${prompt}
[drive] no interactive terminal and no LAKEBASE_TDD_GATE_ANSWER_FILE , auto-continuing past ${label}.
`
    );
    resolve2();
  });
}
function withBuildRecording(inner, cfg) {
  const recordBuildDir = process.env.LAKEBASE_TDD_RECORD_BUILD_DIR?.trim();
  if (!recordBuildDir) return inner;
  let turn = 0;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction(a, i) : void 0,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver")) {
        turn += 1;
        const dir = recordBuildTurn({
          recordBuildDir,
          projectDir: cfg.projectDir,
          tddDir: cfg.tddDir,
          featureId: cfg.featureId,
          story: action.story,
          turn,
          role: action.role,
          ac: action.ac,
          mode: action.buildMode
        });
        process.stderr.write(
          `[record] turn ${turn}: ${action.role}${action.buildMode ? ` (${action.buildMode})` : ""}${action.ac ? ` ${action.ac}` : ""} -> ${dir}
`
        );
      }
    }
  };
}
function withTurnRecording(inner, cfg) {
  const recordDir = process.env.LAKEBASE_TDD_RECORD_DIR?.trim();
  if (!recordDir) return inner;
  seedRecorderBaseline({ recordDir, projectDir: cfg.projectDir, tddDir: cfg.tddDir });
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction(a, i) : void 0,
    onHandback: inner.onHandback ? (h, d) => inner.onHandback(h, d) : void 0,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "done") return;
      const rec = recordTurn({ recordDir, projectDir: cfg.projectDir, tddDir: cfg.tddDir, action, step: 0 });
      process.stderr.write(
        `[record] turn ${rec.ordinal} (${rec.dir}): ${rec.produced.length} produced${rec.deleted.length ? `, ${rec.deleted.length} deleted` : ""}
`
      );
    }
  };
}
function gatedStopWhen(base, interactive) {
  if (!interactive) return base;
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a) || isHumanInputAction(a);
}
function pendingGateOf(r) {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : void 0;
}
function reportGate(gate) {
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${JSON.stringify(gate)}. Surface it to the human; on approval record their decision (the approver), then re-run to continue.
`
  );
}
async function runSprintMode(args) {
  const sprint = args.sprint;
  const projectDir = args.projectDir ?? process.cwd();
  const tddDir = args.tddDir ?? path5.join(projectDir, ".tdd");
  const claimJs = path5.join(__dirname, "..", "lakebase", "scm-claim-feature.cli.js");
  const settings = resolveTddSettings({ projectDir });
  const interactive = (args.gates ?? settings.project.gates) === "interactive";
  const skipSizing = args.noSizing ?? !settings.plan.sizing;
  const effects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, args, "plan");
      const planning = {
        // Sizing is ON by default; --no-sizing (or config plan.sizing:false) opts out.
        readState: async () => deriveSprintPlanningState(tddDir, sprint, { skipSizing }),
        async perform(action) {
          for (const cmd of commandsForAction(action, cfg)) await cfg.runner.run(cmd);
        },
        onAction: cfg.onAction
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(withTurnRecording(planning, cfg), {
        ...base,
        stopWhen: gatedStopWhen(base.stopWhen, interactive)
      });
      return { pendingGate: pendingGateOf(r) };
    },
    async readBacklog() {
      return backlogFeatureIds(readBacklog(tddDir, sprint));
    },
    async claimFeature(featureId) {
      await spawnCmd("node", [claimJs, featureId, "--project-dir", projectDir, "--json"], projectDir);
    },
    async driveFeature(featureId) {
      const cfg = buildCfg(args, featureId);
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg, args, "full");
      const r = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
        stopWhen: gatedStopWhen(void 0, interactive)
      });
      return { pendingGate: pendingGateOf(r) };
    },
    onFeature: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f}
`)
  };
  if (args.planOnly) {
    try {
      const planning = await effects.drivePlanning();
      if (planning.pendingGate) reportGate(planning.pendingGate);
      else process.stderr.write(`[plan] ${sprint} planning complete (plan gate approved)
`);
      return 0;
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
      return 1;
    }
  }
  try {
    const result = await runSprint(effects);
    if (result.pendingGate) {
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}
`);
      reportGate(result.pendingGate);
    } else {
      process.stderr.write(`[sprint] ${sprint} complete: ${result.features.length} feature(s)
`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    return 1;
  }
}
function snapshotRunConfig(cfg, args, bound) {
  writeRunConfig({
    projectDir: cfg.projectDir,
    tddDir: cfg.tddDir,
    bound,
    gates: args.gates ?? "proxy",
    uiTrack: cfg.uiTrack,
    buildSessionScope: cfg.buildSessionScope,
    reviewEffort: cfg.reviewEffort,
    deployTarget: cfg.deployTarget,
    modelForRole: cfg.modelForRole ?? (() => "inherit")
  });
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`lakebase-tdd-drive: --feature is required.

${help()}`);
    return 2;
  }
  let bound;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`lakebase-tdd-drive: --only must be design|build|deploy (got "${args.only}").
`);
      return 2;
    }
    bound = args.only;
  }
  const boundOpts = bound ? driverBoundOptions(bound) : {};
  let pauseMilestone;
  if (args.pauseBefore) {
    if (!["navigator", "release-engineer"].includes(args.pauseBefore)) {
      process.stderr.write(
        `lakebase-tdd-drive: --pause-before must be navigator|release-engineer (got "${args.pauseBefore}").
`
      );
      return 2;
    }
    pauseMilestone = args.pauseBefore;
  }
  const pauseBefore = pauseMilestone ? pauseBeforeMilestone(pauseMilestone) : void 0;
  const confirmContinue = pauseMilestone ? makeConfirmContinue() : void 0;
  const cfg = buildCfg(args, args.feature);
  resetStaleTerminalPhase(cfg.tddDir);
  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }
  cfg.runner = execRunner(cfg);
  snapshotRunConfig(cfg, args, bound ?? "full");
  const interactive = (args.gates ?? resolveTddSettings({ projectDir: cfg.projectDir }).project.gates) === "interactive";
  try {
    const result = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
      maxSteps: args.maxSteps,
      transition: boundOpts.transition,
      stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
      pauseBefore,
      confirmContinue
    });
    const pendingGate = pendingGateOf(result);
    if (result.escalated) {
      const e = result.escalation;
      process.stderr.write(
        `[drive] RAISED TO HIL after ${result.iterations} actions , awaiting HIL decision.
        source: ${e?.source}
        reason: ${e?.reason}
        recorded under .tdd/escalations/ ; resolve it, then re-run to resume.
`
      );
      return 3;
    } else if (result.stoppedAtMax) {
      process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)
`);
    } else if (pendingGate) {
      reportGate(pendingGate);
    } else if (result.stoppedAtBound) {
      process.stderr.write(`[drive] ${bound ?? "phase"} complete in ${result.iterations} actions (bounded)
`);
    } else {
      process.stderr.write(`[drive] done in ${result.iterations} actions
`);
    }
    return 0;
  } catch (err) {
    if (err instanceof ProtocolViolationError) {
      const h = err.handoff;
      try {
        writeEscalation(cfg.tddDir, {
          source: `protocol:${h.responder}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...h.story ? { story_id: h.story } : {}
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:${h.responder}`, reason: err.message, ...h.story ? { story: h.story } : {} }
          },
          { tddDir: cfg.tddDir }
        );
      } catch {
      }
      process.stderr.write(`[drive] ${err.message}
        recorded under .tdd/escalations/ ; fix the responder, then re-run.
`);
      return 3;
    }
    if (err instanceof UnexpectedCallbackError) {
      try {
        writeEscalation(cfg.tddDir, {
          source: `protocol:unexpected-caller:${err.from}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...err.scope.story ? { story_id: err.scope.story } : {}
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:unexpected-caller:${err.from}`, reason: err.message, ...err.scope.story ? { story: err.scope.story } : {} }
          },
          { tddDir: cfg.tddDir }
        );
      } catch {
      }
      process.stderr.write(`[drive] ${err.message}
        recorded under .tdd/escalations/ ; resolve it, then re-run.
`);
      return 3;
    }
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    return 1;
  }
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=drive.cli.cjs.map