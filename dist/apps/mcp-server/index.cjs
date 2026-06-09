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
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl, importMetaUrl;
var init_cjs_shims = __esm({
  "node_modules/tsup/assets/cjs_shims.js"() {
    "use strict";
    getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
    importMetaUrl = /* @__PURE__ */ getImportMetaUrl();
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
    function removeDotSegments(path24) {
      let input = path24;
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
        const [path24, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path24 && path24 !== "/" ? path24 : void 0;
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
    function resolveComponent(base, relative, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative = parse(serialize(relative, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative.scheme) {
        target.scheme = relative.scheme;
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
          target.userinfo = relative.userinfo;
          target.host = relative.host;
          target.port = relative.port;
          target.path = removeDotSegments(relative.path || "");
          target.query = relative.query;
        } else {
          if (!relative.path) {
            target.path = base.path;
            if (relative.query !== void 0) {
              target.query = relative.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative.path[0] === "/") {
              target.path = removeDotSegments(relative.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative.path;
              } else if (!base.path) {
                target.path = relative.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative.fragment;
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
        const { loadSchema } = this.opts;
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
            return await (this._loading[ref] = loadSchema(ref));
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

// apps/mcp-server/index.ts
var mcp_server_exports = {};
__export(mcp_server_exports, {
  createServer: () => createServer
});
module.exports = __toCommonJS(mcp_server_exports);
init_cjs_shims();
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");

// apps/mcp-server/tools.ts
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
var UID_PATTERN = /^br-[a-z0-9-]+$/;
function looksLikeBranchUid(s) {
  return UID_PATTERN.test(s);
}
function asBranchName(s) {
  if (!s) throw new TypeError("BranchName cannot be empty");
  if (looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. BranchName is the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders'); BranchUid is the system identifier returned by list-branches as the 'uid' field. The Lakebase API rejects a BranchUid in any path-shaped field. If you really mean a BranchUid, use asBranchUid() instead \u2013 but verify you're calling a function that takes one.`
    );
  }
  return s;
}
function asBranchUid(s) {
  if (!s) throw new TypeError("BranchUid cannot be empty");
  if (!looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' is not a BranchUid (must match the br-\u2026 pattern). If you have a BranchName (resource-path leaf like 'production'), use asBranchName() instead.`
    );
  }
  return s;
}
function branchNameFromResourcePath(path24) {
  if (!path24.includes("/branches/")) return null;
  const leaf = path24.split("/branches/").pop();
  if (!leaf) return null;
  try {
    return asBranchName(leaf);
  } catch {
    return null;
  }
}

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
var LakebaseBranchError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseBranchError";
  }
};
var LakebaseBranchTtlTooLongError = class extends LakebaseBranchError {
  /** The TTL that was attempted (the value passed to the API). */
  attemptedTtl;
  constructor(attemptedTtl, underlyingMessage) {
    super(
      `Branch create rejected: TTL '${attemptedTtl}' exceeds the workspace's maximum expiration policy. Pass a shorter ttl arg (e.g. "604800s" for 7 days) or set noExpiry: true. The workspace cap is not directly exposed by the Lakebase API; the project's history_retention_duration (from \`databricks postgres get-project\`) is a conservative starting point.

Underlying error: ${underlyingMessage}`
    );
    this.name = "LakebaseBranchTtlTooLongError";
    this.attemptedTtl = attemptedTtl;
  }
};
function isTtlTooLongError(stderr) {
  return /expiration time exceeds the maximum expiration time/i.test(stderr);
}
function parseLakebaseTtl(ttl) {
  if (!ttl) return void 0;
  const m = ttl.trim().match(/^(\d+)s?$/);
  if (!m) return void 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : void 0;
}
function minLakebaseTtl(a, b) {
  const sa = parseLakebaseTtl(a);
  const sb = parseLakebaseTtl(b);
  if (sa === void 0 && sb === void 0) return void 0;
  if (sa === void 0) return `${sb}s`;
  if (sb === void 0) return `${sa}s`;
  return `${Math.min(sa, sb)}s`;
}
var RETENTION_CACHE = /* @__PURE__ */ new Map();
function getCachedProjectRetention(instance) {
  return RETENTION_CACHE.get(instance);
}
function cacheProjectRetention(instance, ttl) {
  RETENTION_CACHE.set(instance, ttl);
}
function projectPath(instance) {
  return `projects/${instance}`;
}
async function listBranches(opts) {
  const raw = await dbcli(
    ["postgres", "list-branches", projectPath(opts.instance), "-o", "json"],
    opts.host
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseBranchError(`Unexpected CLI output: ${raw.slice(0, 200)}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
  return items.map(parseBranch).filter((b) => b !== void 0);
}
async function getBranchByName(branchNameOrUid, opts) {
  const branches = await listBranches(opts);
  return branches.find(
    (b) => b.uid === branchNameOrUid || b.name === branchNameOrUid || b.name.endsWith(`/${branchNameOrUid}`)
  );
}
async function getDefaultBranch(opts) {
  const branches = await listBranches(opts);
  return branches.find((b) => b.isDefault);
}
function isLongRunningTierBranch(b) {
  return !b.isDefault && !b.expireTime;
}
function isTier(name, branches) {
  if (!name) {
    return false;
  }
  return branches.some((b) => isLongRunningTierBranch(b) && b.nameLeaf === name);
}
async function resolveBranchPath(branchNameOrUid, opts) {
  if (branchNameOrUid.startsWith("projects/") && branchNameOrUid.includes("/branches/")) {
    return branchNameOrUid;
  }
  const branch = await getBranchByName(branchNameOrUid, opts);
  return branch?.name;
}
async function resolveBranchId(args) {
  const { branch, ...opts } = args;
  if (branch.startsWith("projects/") && branch.includes("/branches/")) {
    const leaf2 = branch.split("/branches/").pop();
    if (leaf2) return leaf2;
  }
  if (!branch.startsWith("br-")) {
    return branch;
  }
  const info = await getBranchByName(branch, opts);
  if (!info) {
    throw new LakebaseBranchError(
      `Could not resolve branch "${branch}" in project "${opts.instance}". Pass either the branch_id (e.g. "demo-feature") or the branch uid.`
    );
  }
  const leaf = info.name.split("/branches/").pop();
  if (!leaf) {
    throw new LakebaseBranchError(
      `Branch info for "${branch}" missing a name segment (got "${info.name}").`
    );
  }
  return leaf;
}
function parseBranch(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const r = raw;
  const name = r.name ?? "";
  if (!name) return void 0;
  const nameLeaf = branchNameFromResourcePath(name);
  if (!nameLeaf) return void 0;
  if (!r.uid) return void 0;
  let uid;
  try {
    uid = asBranchUid(r.uid);
  } catch {
    return void 0;
  }
  const sourceBranchName = r.status?.source_branch ?? r.spec?.source_branch;
  const sourceBranchId = sourceBranchName ? branchNameFromResourcePath(sourceBranchName) ?? void 0 : void 0;
  return {
    uid,
    nameLeaf,
    name,
    state: r.status?.current_state ?? r.state ?? "UNKNOWN",
    sourceBranchName,
    sourceBranchId,
    isDefault: r.status?.default === true || r.is_default === true,
    expireTime: r.status?.expire_time,
    isProtected: r.status?.is_protected
  };
}
async function dbcli(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/constants.ts
init_cjs_shims();
var POSTGRES_PORT = 5432;
var DEFAULT_DATABASE = "databricks_postgres";
var DEFAULT_ENDPOINT = "primary";

// scripts/lakebase/get-connection.ts
async function getConnection(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const endpointPath2 = `projects/${args.instance}/branches/${branchId}/endpoints/${endpointName}`;
  if (args.output === "dsn") {
    const host2 = await resolveEndpointHost(args.instance, branchId);
    const { token, email: email2 } = await mintCredential(endpointPath2);
    const url = buildPostgresUrl({ host: host2, port: POSTGRES_PORT, database, user: email2, password: token });
    return { url, host: host2, port: POSTGRES_PORT, database, user: email2, endpointPath: endpointPath2 };
  }
  const host = await resolveEndpointHost(args.instance, branchId);
  const email = await resolveCurrentUser();
  return (0, import_lakebase.createLakebasePool)({
    endpoint: endpointPath2,
    host,
    database,
    user: email,
    // workspaceClient is passed through verbatim. createLakebasePool falls
    // back to environment / ServiceContext when omitted.
    ...args.workspaceClient !== void 0 ? { workspaceClient: args.workspaceClient } : {}
  });
}
async function resolveEndpointHost(instance, branch) {
  const branchId = await resolveBranchId({ instance, branch });
  const branchPath = `projects/${instance}/branches/${branchId}`;
  const raw = dbcli2(["postgres", "list-endpoints", branchPath, "-o", "json"]);
  const endpoints = JSON.parse(raw);
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error(`No endpoints found for branch ${branchPath}`);
  }
  const host = endpoints[0]?.status?.hosts?.host;
  if (!host) {
    throw new Error(`Endpoint exists for ${branchPath} but has no host yet \u2013 wait for it to become ACTIVE`);
  }
  return host;
}
async function mintCredential(endpointPath2) {
  const raw = dbcli2(["postgres", "generate-database-credential", endpointPath2, "-o", "json"]);
  const token = JSON.parse(raw)?.token ?? "";
  if (!token) {
    throw new Error(`generate-database-credential returned no token for ${endpointPath2}`);
  }
  const email = await resolveCurrentUser();
  return { token, email };
}
async function resolveCurrentUser() {
  const raw = dbcli2(["current-user", "me", "-o", "json"]);
  const parsed = JSON.parse(raw);
  const email = parsed.userName ?? parsed.emails?.[0]?.value;
  if (!email) {
    throw new Error("Could not resolve current user from `databricks current-user me`");
  }
  return email;
}
function buildPostgresUrl(parts) {
  const u = new URL(`postgresql://${parts.host}:${parts.port}/${encodeURIComponent(parts.database)}`);
  u.username = encodeURIComponent(parts.user);
  u.password = encodeURIComponent(parts.password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}
function dbcli2(args) {
  try {
    return (0, import_node_child_process2.execFileSync)("databricks", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault
    });
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new Error(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/schema-diff.ts
init_cjs_shims();
var import_node_child_process3 = require("child_process");
var IGNORED_TABLES = /* @__PURE__ */ new Set(["flyway_schema_history"]);
var SCHEMA_QUERY = "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c JOIN pg_tables t ON c.table_name = t.tablename WHERE c.table_schema='public' AND t.schemaname='public' ORDER BY c.table_name, c.ordinal_position";
async function getSchemaDiff(args) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const baseResult = {
    branchName: args.branch,
    comparisonBranchName: "",
    timestamp,
    migrations: [],
    created: [],
    modified: [],
    removed: [],
    branchTables: [],
    inSync: false
  };
  const comparisonBranch = args.comparisonBranch ?? resolveComparisonBranch(args.instance, args.branch);
  if (!comparisonBranch) {
    return { ...baseResult, error: "Could not resolve a comparison target Lakebase branch" };
  }
  if (comparisonBranch === args.branch) {
    return { ...baseResult, comparisonBranchName: comparisonBranch, inSync: true };
  }
  let targetPool;
  let comparisonPool;
  try {
    targetPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: args.branch,
      database: args.database,
      workspaceClient: args.workspaceClient
    });
    comparisonPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: comparisonBranch,
      database: args.database,
      workspaceClient: args.workspaceClient
    });
    const targetTables = await listTables(targetPool);
    const comparisonTables = await listTables(comparisonPool);
    return diffSchemas(args.branch, comparisonBranch, targetTables, comparisonTables, timestamp);
  } catch (err) {
    return {
      ...baseResult,
      comparisonBranchName: comparisonBranch,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    if (targetPool) await targetPool.end().catch(() => void 0);
    if (comparisonPool) await comparisonPool.end().catch(() => void 0);
  }
}
async function listTables(pool) {
  const { rows } = await pool.query(SCHEMA_QUERY);
  const tables = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.table_name || IGNORED_TABLES.has(r.table_name)) continue;
    if (!tables.has(r.table_name)) tables.set(r.table_name, []);
    tables.get(r.table_name).push({ name: r.column_name, dataType: r.data_type });
  }
  return tables;
}
function diffSchemas(branch, comparisonBranch, target, comparison, timestamp) {
  const created = [];
  const removed = [];
  const modified = [];
  for (const [name, columns] of target) {
    if (!comparison.has(name)) {
      created.push({ type: "TABLE", name, columns });
    }
  }
  for (const [name, columns] of comparison) {
    if (!target.has(name)) {
      removed.push({ type: "TABLE", name, columns });
    }
  }
  for (const [name, targetCols] of target) {
    const comparisonCols = comparison.get(name);
    if (!comparisonCols) continue;
    const comparisonKeys = new Set(comparisonCols.map(colKey));
    const targetKeys = new Set(targetCols.map(colKey));
    const addedColumns = targetCols.filter((c) => !comparisonKeys.has(colKey(c)));
    const removedColumns = comparisonCols.filter((c) => !targetKeys.has(colKey(c)));
    if (addedColumns.length > 0 || removedColumns.length > 0) {
      modified.push({
        type: "TABLE",
        name,
        columns: targetCols,
        addedColumns,
        removedColumns,
        prodColumns: comparisonCols
      });
    }
  }
  const branchTables = [...target.entries()].map(([name, columns]) => ({ type: "TABLE", name, columns })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    branchName: branch,
    comparisonBranchName: comparisonBranch,
    timestamp,
    migrations: [],
    created: created.sort((a, b) => a.name.localeCompare(b.name)),
    modified: modified.sort((a, b) => a.name.localeCompare(b.name)),
    removed: removed.sort((a, b) => a.name.localeCompare(b.name)),
    branchTables,
    inSync: created.length === 0 && modified.length === 0 && removed.length === 0
  };
}
var colKey = (c) => `${c.name}:${c.dataType}`;
function resolveComparisonBranch(instance, branch) {
  const branchInfo = describeBranch(instance, branch);
  const sourceBranch = branchInfo?.status?.source_branch ?? branchInfo?.spec?.source_branch;
  if (sourceBranch && typeof sourceBranch === "string") {
    const leaf = sourceBranch.split("/branches/").pop();
    if (leaf) return leaf;
  }
  const def = findDefaultBranch(instance);
  if (def) return def;
  return void 0;
}
function describeBranch(instance, branch) {
  const branchPath = `projects/${instance}/branches/${branch}`;
  try {
    const raw = dbcli3(["postgres", "get-branch", branchPath, "-o", "json"]);
    return JSON.parse(raw);
  } catch {
    try {
      const raw = dbcli3(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
      return items.find((b) => b.uid === branch || b.name?.endsWith(`/branches/${branch}`));
    } catch {
      return void 0;
    }
  }
}
function findDefaultBranch(instance) {
  try {
    const raw = dbcli3(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    const def = items.find((b) => b.status?.default === true || b.is_default === true);
    if (!def) return void 0;
    return def.name?.split("/branches/").pop() ?? def.uid ?? void 0;
  } catch {
    return void 0;
  }
}
function dbcli3(args) {
  return (0, import_node_child_process3.execFileSync)("databricks", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.cliDefault
  });
}

// scripts/lakebase/create-project.ts
init_cjs_shims();
var fs14 = __toESM(require("fs"), 1);
var path13 = __toESM(require("path"), 1);
var import_node_child_process7 = require("child_process");

// scripts/lakebase/env-file.ts
init_cjs_shims();
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var CONNECTION_KEYS = [
  "DATABASE_URL",
  "DB_USERNAME",
  "DB_PASSWORD",
  "LAKEBASE_BRANCH_ID",
  "LAKEBASE_HOST"
];
function updateEnvConnection(args) {
  const existing = fs.existsSync(args.envPath) ? fs.readFileSync(args.envPath, "utf-8") : "";
  const preserved = existing.split("\n").filter((line) => {
    const trimmed = line.trimStart();
    return !CONNECTION_KEYS.some((k) => trimmed.startsWith(`${k}=`));
  }).join("\n").replace(/\n+$/, "");
  const lines = [];
  if (args.comment !== void 0) {
    lines.push(args.comment);
  }
  if (args.endpointHost !== void 0) {
    lines.push(`LAKEBASE_HOST=${args.endpointHost}`);
  }
  lines.push(`LAKEBASE_BRANCH_ID=${args.branchId}`);
  lines.push(`DATABASE_URL=${args.databaseUrl}`);
  lines.push(`DB_USERNAME=${args.username}`);
  lines.push(`DB_PASSWORD=${args.password}`);
  lines.push("");
  const block = lines.join("\n");
  const content = preserved ? `${preserved}
${block}` : block;
  fs.mkdirSync(path.dirname(args.envPath), { recursive: true });
  fs.writeFileSync(args.envPath, content);
}

// scripts/lakebase/project-verify.ts
init_cjs_shims();
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
function verifyHooks(projectDir) {
  const hooksDir = path2.join(projectDir, ".git", "hooks");
  return {
    postCheckout: fs2.existsSync(path2.join(hooksDir, "post-checkout")),
    prepareCommitMsg: fs2.existsSync(path2.join(hooksDir, "prepare-commit-msg")),
    prePush: fs2.existsSync(path2.join(hooksDir, "pre-push"))
  };
}
function verifyWorkflows(projectDir) {
  const wfDir = path2.join(projectDir, ".github", "workflows");
  return {
    pr: fs2.existsSync(path2.join(wfDir, "pr.yml")),
    merge: fs2.existsSync(path2.join(wfDir, "merge.yml"))
  };
}
function verifyProject(projectDir) {
  const hooks = verifyHooks(projectDir);
  const workflows = verifyWorkflows(projectDir);
  const warnings = [];
  if (!hooks.postCheckout || !hooks.prepareCommitMsg || !hooks.prePush) {
    warnings.push("Some git hooks not installed (post-checkout / prepare-commit-msg / pre-push)");
  }
  if (!workflows.pr || !workflows.merge) {
    warnings.push("Some GitHub Actions workflows missing (pr.yml / merge.yml)");
  }
  return { hooks, workflows, warnings };
}

// scripts/github/repo.ts
init_cjs_shims();
var import_octokit = require("octokit");

// scripts/github/auth.ts
init_cjs_shims();
var import_node_child_process4 = require("child_process");
var GITHUB_SCOPES = ["repo", "workflow", "delete_repo"];
async function resolveGitHubToken(scopes = GITHUB_SCOPES) {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromVsCode = await tryVsCodeSession({ scopes });
  if (fromVsCode) return fromVsCode;
  const fromGh = tryGhAuthToken();
  if (fromGh) return fromGh;
  throw new Error(
    "No GitHub auth available. Set GITHUB_TOKEN, sign in to GitHub in VS Code, or run `gh auth login`."
  );
}
async function tryVsCodeSession(opts = {}) {
  const scopes = opts.scopes ?? GITHUB_SCOPES;
  try {
    const vscode = await import("vscode");
    if (!vscode?.authentication?.getSession) return void 0;
    const session = await vscode.authentication.getSession("github", [...scopes], {
      createIfNone: !!opts.createIfNone
    });
    return session?.accessToken;
  } catch {
    return void 0;
  }
}
function tryGhAuthToken() {
  try {
    const raw = (0, import_node_child_process4.execFileSync)("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3
    });
    const token = raw.trim();
    return token || void 0;
  } catch {
    return void 0;
  }
}
async function diagnoseGitHubAuth() {
  const envSet = !!process.env.GITHUB_TOKEN?.trim();
  const vscodeAvailable = await tryVsCodeSession().then(Boolean).catch(() => false);
  const ghAvailable = !!tryGhAuthToken();
  const sources = [];
  if (envSet) sources.push("env");
  if (vscodeAvailable) sources.push("vscode");
  if (ghAvailable) sources.push("gh");
  return {
    sources,
    primary: sources[0],
    scopes: [...GITHUB_SCOPES]
  };
}

// scripts/util/parse-owner-repo.ts
init_cjs_shims();
function parseOwnerRepo(urlOrSlug) {
  const trimmed = urlOrSlug.trim().replace(/\.git$/, "");
  if (trimmed.includes("/")) {
    const slugMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (slugMatch) {
      return { owner: slugMatch[1], repo: slugMatch[2] };
    }
    const parts = trimmed.split("/");
    if (parts.length >= 2) {
      return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
      };
    }
  }
  throw new Error(`Invalid GitHub repo reference: ${urlOrSlug}`);
}
function formatOwnerRepo(owner, repo) {
  return `${owner}/${repo}`;
}

// scripts/github/repo.ts
var GitHubRepoError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubRepoError";
    this.status = status;
  }
};
async function newContext() {
  const token = await resolveGitHubToken();
  return { octokit: new import_octokit.Octokit({ auth: token }) };
}
function wrap(err, context) {
  if (err instanceof import_octokit.RequestError) {
    throw new GitHubRepoError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubRepoError(`${context}: ${err.message}`);
  }
  throw new GitHubRepoError(context);
}
async function getLogin(ctx) {
  if (!ctx.loginPromise) {
    ctx.loginPromise = ctx.octokit.rest.users.getAuthenticated().then(({ data }) => data.login);
  }
  return ctx.loginPromise;
}
async function getCurrentUser() {
  try {
    const ctx = await newContext();
    return await getLogin(ctx);
  } catch (err) {
    wrap(err, "GitHub authentication failed");
  }
}
async function createRepo(name, opts = {}) {
  try {
    const ctx = await newContext();
    const isPrivate = opts.private !== false;
    const description = opts.description;
    if (name.includes("/")) {
      const { owner, repo } = parseOwnerRepo(name);
      const login = await getLogin(ctx);
      let data2;
      if (owner.toLowerCase() === login.toLowerCase()) {
        ({ data: data2 } = await ctx.octokit.rest.repos.createForAuthenticatedUser({
          name: repo,
          private: isPrivate,
          description
        }));
      } else {
        ({ data: data2 } = await ctx.octokit.rest.repos.createInOrg({
          org: owner,
          name: repo,
          private: isPrivate,
          description
        }));
      }
      return data2.html_url || `https://github.com/${formatOwnerRepo(owner, repo)}`;
    }
    const { data } = await ctx.octokit.rest.repos.createForAuthenticatedUser({
      name,
      private: isPrivate,
      description
    });
    return data.html_url || `https://github.com/${data.full_name}`;
  } catch (err) {
    wrap(err, `Failed to create repository "${name}"`);
  }
}
async function getRepoFullName(name) {
  try {
    const { owner, repo } = parseOwnerRepo(name);
    const ctx = await newContext();
    const { data } = await ctx.octokit.rest.repos.get({ owner, repo });
    return data.full_name || formatOwnerRepo(owner, repo);
  } catch (err) {
    wrap(err, `Repository "${name}" is not visible`);
  }
}

// scripts/git/clone.ts
init_cjs_shims();

// scripts/util/exec.ts
init_cjs_shims();
var cp = __toESM(require("child_process"), 1);
function shq(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
function exec2(command, opts = {}) {
  return new Promise((resolve2, reject) => {
    const options = {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 6e4
    };
    if (opts.env) {
      options.env = { ...process.env, ...opts.env };
    }
    cp.exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        reject(new Error(`${command}: ${msg}`));
        return;
      }
      resolve2(String(stdout).trim());
    });
  });
}

// scripts/git/clone.ts
async function cloneRepo(args) {
  await exec2(`git clone ${shq(args.repoUrl)}`, {
    cwd: args.parentDir,
    timeout: args.timeoutMs ?? 6e4
  });
}

// scripts/git/init.ts
init_cjs_shims();
async function gitInit(projectDir) {
  await exec2("git init -b main", { cwd: projectDir, timeout: 15e3 });
}

// scripts/git/commit-push.ts
init_cjs_shims();
var WorkflowScopeError = class extends Error {
  constructor(projectDir) {
    super(
      `Push rejected: GitHub token lacks the \`workflow\` OAuth scope required for commits touching \`.github/workflows/*\`. The project on disk is fine; only the initial push failed.

To finish:
  1. Re-sign in to GitHub in VS Code and grant the workflow scope (or set      GITHUB_TOKEN to a token with workflow scope)
  2. Then from the project dir:  cd ${projectDir} && git push -u origin main`
    );
    this.name = "WorkflowScopeError";
  }
};
async function commitAndPush(args) {
  await exec2("git add -A", { cwd: args.projectDir });
  await exec2(`git commit -m ${JSON.stringify(args.message)}`, {
    cwd: args.projectDir,
    timeout: 3e4
  });
  if (args.push === false) return;
  const remote = args.remote ?? "origin";
  const branch = args.branch ?? "main";
  try {
    await exec2(`git push -u ${remote} ${branch}`, {
      cwd: args.projectDir,
      timeout: 3e4
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/without `?workflow`? scope|workflow scope/i.test(msg)) {
      throw new WorkflowScopeError(args.projectDir);
    }
    throw err;
  }
}

// scripts/lakebase/lakebase-project.ts
init_cjs_shims();
var import_node_child_process5 = require("child_process");
var import_node_util2 = require("util");
var execFileP2 = (0, import_node_util2.promisify)(import_node_child_process5.execFile);
var LakebaseProjectError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseProjectError";
  }
};
async function createLakebaseProject(args) {
  const raw = await dbcli4(["postgres", "create-project", args.projectId, "-o", "json"], args.host);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseProjectError(`Unexpected CLI output (not JSON): ${raw.slice(0, 200)}`);
  }
  const result = parsed.response ?? parsed.result ?? parsed;
  const status = result.status ?? void 0;
  return {
    uid: result.uid ?? args.projectId,
    name: result.name ?? `projects/${args.projectId}`,
    state: status?.current_state ?? result.state ?? "READY"
  };
}
function findDefaultBranchName(items) {
  const def = items.find((b) => b.status?.default === true || b.is_default === true);
  if (!def || !def.name) return null;
  return branchNameFromResourcePath(def.name);
}
async function getDefaultBranchName(args) {
  try {
    const raw = await dbcli4(
      ["postgres", "list-branches", `projects/${args.projectId}`, "-o", "json"],
      args.host
    );
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    return findDefaultBranchName(items);
  } catch {
    return null;
  }
}
async function getDefaultBranchId(args) {
  const name = await getDefaultBranchName(args);
  return name ?? "";
}
function findHistoryRetentionDuration(parsed) {
  const raw = parsed.history_retention_duration ?? parsed.historyRetentionDuration;
  if (!raw || typeof raw !== "string") return void 0;
  const m = raw.trim().match(/^(\d+)s?$/);
  if (!m) return void 0;
  const seconds = Number.parseInt(m[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return void 0;
  return `${seconds}s`;
}
async function getProjectRetentionDuration(args) {
  const name = args.projectId.startsWith("projects/") ? args.projectId : `projects/${args.projectId}`;
  let raw;
  try {
    raw = await dbcli4(["postgres", "get-project", name, "-o", "json"], args.host);
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  return findHistoryRetentionDuration(parsed);
}
async function dbcli4(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP2("databricks", args, {
      env,
      timeout: KIT_TIMEOUTS.cliDefault
    });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseProjectError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/scaffold.ts
init_cjs_shims();
var cp2 = __toESM(require("child_process"), 1);
var fs8 = __toESM(require("fs"), 1);
var path7 = __toESM(require("path"), 1);
var import_node_url3 = require("url");

// scripts/lakebase/scaffold-language.ts
init_cjs_shims();
var fs7 = __toESM(require("fs"), 1);
var path6 = __toESM(require("path"), 1);
var import_node_url2 = require("url");

// scripts/util/copy-dir-substituted.ts
init_cjs_shims();
var fs3 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var SKIP_ENTRIES = /* @__PURE__ */ new Set([".gitignore.extra", "fallback"]);
function copyDirSubstituted(srcDir, destDir, args = {}) {
  const skip = args.skipEntries ?? SKIP_ENTRIES;
  fs3.mkdirSync(destDir, { recursive: true });
  for (const file of fs3.readdirSync(srcDir)) {
    if (skip.has(file)) continue;
    const srcPath = path3.join(srcDir, file);
    const destPath = path3.join(destDir, file);
    if (fs3.statSync(srcPath).isDirectory()) {
      copyDirSubstituted(srcPath, destPath, { projectName: args.projectName, skipEntries: /* @__PURE__ */ new Set() });
    } else {
      let content = fs3.readFileSync(srcPath, "utf-8");
      if (args.projectName) {
        content = content.replace(/\{\{PROJECT_NAME\}\}/g, args.projectName);
      }
      fs3.writeFileSync(destPath, content);
    }
  }
}

// scripts/lakebase/spring-initializr.ts
init_cjs_shims();
var fs6 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
var import_node_url = require("url");

// scripts/util/maven-coords.ts
init_cjs_shims();
function sanitizeArtifactId(name) {
  let id = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!id) {
    id = "demo";
  }
  if (/^[0-9]/.test(id)) {
    id = `app-${id}`;
  }
  return id;
}

// scripts/util/zip-extract.ts
init_cjs_shims();
var fs4 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);
var import_adm_zip = __toESM(require("adm-zip"), 1);
function extractZipToDir(zipBuffer, targetDir) {
  fs4.mkdirSync(targetDir, { recursive: true });
  const zip = new import_adm_zip.default(zipBuffer);
  const tempDir = path4.join(targetDir, `.initializr-extract-${Date.now()}`);
  zip.extractAllTo(tempDir, true);
  const entries = fs4.readdirSync(tempDir).filter((e) => e !== "__MACOSX");
  const sourceDir = entries.length === 1 && fs4.statSync(path4.join(tempDir, entries[0])).isDirectory() ? path4.join(tempDir, entries[0]) : tempDir;
  copyDirRecursive(sourceDir, targetDir);
  fs4.rmSync(tempDir, { recursive: true, force: true });
}
function copyDirRecursive(src, dest) {
  fs4.mkdirSync(dest, { recursive: true });
  for (const entry of fs4.readdirSync(src)) {
    const srcPath = path4.join(src, entry);
    const destPath = path4.join(dest, entry);
    if (fs4.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs4.copyFileSync(srcPath, destPath);
    }
  }
}

// scripts/util/pom-patch.ts
init_cjs_shims();
var fs5 = __toESM(require("fs"), 1);
var FLYWAY_PG_DEPENDENCY = `
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>`;
var LAKEBASE_PLUGINS = `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <argLine>--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading</argLine>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.flywaydb</groupId>
                <artifactId>flyway-maven-plugin</artifactId>
                <configuration>
                    <url>\${env.SPRING_DATASOURCE_URL}</url>
                    <user>\${env.SPRING_DATASOURCE_USERNAME}</user>
                    <password>\${env.SPRING_DATASOURCE_PASSWORD}</password>
                    <baselineOnMigrate>true</baselineOnMigrate>
                </configuration>
            </plugin>`;
function patchPomForLakebase(pomPath) {
  if (!fs5.existsSync(pomPath)) {
    throw new Error(`pom.xml not found at ${pomPath}`);
  }
  let pom = fs5.readFileSync(pomPath, "utf-8");
  if (!pom.includes("flyway-database-postgresql")) {
    pom = pom.replace("</dependencies>", `${FLYWAY_PG_DEPENDENCY}
    </dependencies>`);
  }
  if (!pom.includes("flyway-maven-plugin")) {
    if (pom.includes("<artifactId>spring-boot-maven-plugin</artifactId>")) {
      pom = pom.replace(
        /(<plugin>\s*<groupId>org\.springframework\.boot<\/groupId>\s*<artifactId>spring-boot-maven-plugin<\/artifactId>\s*<\/plugin>)/,
        `$1${LAKEBASE_PLUGINS}`
      );
    } else if (pom.includes("</plugins>")) {
      pom = pom.replace("</plugins>", `${LAKEBASE_PLUGINS}
        </plugins>`);
    }
  } else if (!pom.includes("maven-surefire-plugin")) {
    pom = pom.replace(
      "</plugins>",
      `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <argLine>--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading</argLine>
                </configuration>
            </plugin>
        </plugins>`
    );
  }
  fs5.writeFileSync(pomPath, pom);
}

// scripts/lakebase/spring-initializr.ts
var InitializrNetworkError = class extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = "InitializrNetworkError";
    this.cause = cause;
  }
};
var InitializrParseError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InitializrParseError";
  }
};
var METADATA_ACCEPT = "application/vnd.initializr.v2.3+json";
var CACHE_TTL_MS = KIT_TIMEOUTS.initializrCacheTtl;
var DEFAULT_BASE_URL = KIT_REGISTRIES.springInitializr;
var DEPENDENCIES = "web,data-jpa,postgresql,flyway";
function isPrereleaseBootVersion(version) {
  const upper = version.toUpperCase();
  return upper.includes("SNAPSHOT") || /-(RC|M)\d/i.test(version) || /-(ALPHA|BETA)\d/i.test(version);
}
function resolveLatestBootVersion(section) {
  if (!section || typeof section !== "object") {
    throw new InitializrParseError("Missing bootVersion in Spring Initializr metadata");
  }
  const bootSection = section;
  const values = bootSection.values || [];
  for (const entry of values) {
    if (typeof entry.id === "string" && entry.id && !isPrereleaseBootVersion(entry.id)) {
      return entry.id;
    }
  }
  if (typeof bootSection.default === "string" && bootSection.default) {
    return bootSection.default;
  }
  throw new InitializrParseError("No Spring Boot version found in Initializr metadata");
}
function isLtsJavaVersion(version) {
  const n = Number.parseInt(version, 10);
  if (Number.isNaN(n)) return false;
  if (n === 8 || n === 11) return true;
  return n >= 17 && (n - 17) % 4 === 0;
}
function resolveLatestLtsJavaVersion(section) {
  if (!section || typeof section !== "object") {
    throw new InitializrParseError("Missing javaVersion in Spring Initializr metadata");
  }
  const javaSection = section;
  const available = /* @__PURE__ */ new Set();
  if (typeof javaSection.default === "string" && javaSection.default) {
    available.add(javaSection.default);
  }
  for (const entry of javaSection.values || []) {
    if (typeof entry.id === "string" && entry.id) {
      available.add(entry.id);
    }
  }
  let latest = -1;
  let latestId = "";
  for (const id of available) {
    if (!isLtsJavaVersion(id)) continue;
    const n = Number.parseInt(id, 10);
    if (n > latest) {
      latest = n;
      latestId = id;
    }
  }
  if (latestId) return latestId;
  if (typeof javaSection.default === "string" && javaSection.default) {
    return javaSection.default;
  }
  throw new InitializrParseError("No Java version found in Initializr metadata");
}
var SpringInitializrClient = class {
  metadataCache;
  baseUrl;
  fetchFn;
  constructor(baseUrl = DEFAULT_BASE_URL, fetchFn = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }
  async getMetadata(forceRefresh = false) {
    if (!forceRefresh && this.metadataCache && Date.now() - this.metadataCache.fetchedAt < CACHE_TTL_MS) {
      return this.metadataCache.metadata;
    }
    const url = this.baseUrl.replace(/\/$/, "") + "/";
    let response;
    try {
      response = await this.fetchFn(url, { headers: { Accept: METADATA_ACCEPT } });
    } catch (err) {
      throw new InitializrNetworkError(`Failed to reach Spring Initializr at ${this.baseUrl}`, err);
    }
    if (!response.ok) {
      throw new InitializrNetworkError(`Spring Initializr metadata request failed (${response.status})`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new InitializrParseError("Spring Initializr metadata response was not valid JSON");
    }
    const metadata = parseMetadata(body);
    this.metadataCache = { metadata, fetchedAt: Date.now() };
    return metadata;
  }
  async generateMavenProject(opts) {
    const metadata = await this.getMetadata(true);
    const artifactId = sanitizeArtifactId(opts.artifactId);
    const params = new URLSearchParams({
      type: "maven-project",
      language: opts.language,
      bootVersion: metadata.bootVersion,
      javaVersion: metadata.javaVersion,
      packaging: "jar",
      dependencies: DEPENDENCIES,
      groupId: opts.groupId || "com.example",
      artifactId,
      name: opts.name || artifactId,
      packageName: opts.packageName || "com.example.demo",
      description: opts.description || "Spring Boot + JPA + PostgreSQL with Flyway; database branches via Lakebase.",
      version: "1.0.0-SNAPSHOT"
    });
    const url = `${this.baseUrl.replace(/\/$/, "")}/starter.zip?${params.toString()}`;
    let response;
    try {
      response = await this.fetchFn(url);
    } catch (err) {
      throw new InitializrNetworkError("Failed to download project from Spring Initializr", err);
    }
    if (!response.ok) {
      throw new InitializrNetworkError(`Spring Initializr project generation failed (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
};
function parseMetadata(body) {
  if (!body || typeof body !== "object") {
    throw new InitializrParseError("Spring Initializr metadata response was empty");
  }
  const doc = body;
  return {
    bootVersion: resolveLatestBootVersion(doc.bootVersion),
    javaVersion: resolveLatestLtsJavaVersion(doc.javaVersion)
  };
}
var cachedTemplatesDir;
function findTemplatesDir() {
  if (cachedTemplatesDir) return cachedTemplatesDir;
  const here = path5.dirname((0, import_node_url.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path5.join(dir, "templates", "project");
    if (fs6.existsSync(path5.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir = candidate;
      return cachedTemplatesDir;
    }
    const parent = path5.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate templates/project tree");
}
async function deploySpringStarter(args) {
  const language = args.language;
  const label = language === "kotlin" ? "Kotlin" : "Java";
  const report = args.report ?? (() => {
  });
  const templatesDir = args.templatesDir ?? findTemplatesDir();
  const useFallback = process.env.LAKEBASE_SCAFFOLD_FALLBACK === "1";
  if (useFallback) {
    report(`Using bundled ${label} template (LAKEBASE_SCAFFOLD_FALLBACK).`);
    deploySpringFallback(args.targetDir, language, args.projectName, templatesDir);
    deploySpringOverlays(args.targetDir, templatesDir);
    return;
  }
  report(`Fetching Spring Boot project from start.spring.io (${label}).`);
  let initializrExtracted = false;
  try {
    const client = args.initializrClient ?? new SpringInitializrClient();
    const metadata = await client.getMetadata();
    report(
      `Scaffolding Spring Boot ${metadata.bootVersion} (JVM ${metadata.javaVersion}, ${label}).`,
      `bootVersion=${metadata.bootVersion}`
    );
    const zip = await client.generateMavenProject({
      language,
      artifactId: args.projectName || "demo",
      name: args.projectName
    });
    extractZipToDir(zip, args.targetDir);
    initializrExtracted = true;
    const pomPath = path5.join(args.targetDir, "pom.xml");
    if (!fs6.existsSync(pomPath)) {
      throw new Error("Spring Initializr did not produce a Maven project (missing pom.xml)");
    }
    const mvnw = path5.join(args.targetDir, "mvnw");
    if (fs6.existsSync(mvnw)) fs6.chmodSync(mvnw, 493);
    deploySpringOverlays(args.targetDir, templatesDir);
    patchPomForLakebase(pomPath);
  } catch (err) {
    if (initializrExtracted) {
      throw new Error(
        `Spring Initializr project was extracted but post-processing failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const reason = err instanceof InitializrNetworkError ? err.message : String(err);
    report(`Spring Initializr unavailable; using bundled ${label} template.`, reason);
    clearScaffoldArtifacts(args.targetDir);
    deploySpringFallback(args.targetDir, language, args.projectName, templatesDir);
    deploySpringOverlays(args.targetDir, templatesDir);
  }
}
function deploySpringFallback(targetDir, language, projectName, templatesDir) {
  const fallbackDir = path5.join(templatesDir, language, "fallback");
  if (!fs6.existsSync(fallbackDir)) {
    throw new Error(`No fallback template found for language: ${language}`);
  }
  copyDirSubstituted(fallbackDir, targetDir, { projectName });
  const mvnw = path5.join(targetDir, "mvnw");
  if (fs6.existsSync(mvnw)) fs6.chmodSync(mvnw, 493);
}
function deploySpringOverlays(targetDir, templatesDir) {
  const overlayDir = path5.join(templatesDir, "spring");
  if (!fs6.existsSync(overlayDir)) {
    throw new Error(`Spring overlay template not found at ${overlayDir}`);
  }
  copyDirSubstituted(overlayDir, targetDir);
}
function clearScaffoldArtifacts(targetDir) {
  if (!fs6.existsSync(targetDir)) return;
  for (const entry of fs6.readdirSync(targetDir)) {
    if (entry === ".git") continue;
    fs6.rmSync(path5.join(targetDir, entry), { recursive: true, force: true });
  }
}

// scripts/lakebase/scaffold-language.ts
var cachedTemplatesDir2;
function findTemplatesDir2() {
  if (cachedTemplatesDir2) return cachedTemplatesDir2;
  const here = path6.dirname((0, import_node_url2.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path6.join(dir, "templates", "project");
    if (fs7.existsSync(path6.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir2 = candidate;
      return cachedTemplatesDir2;
    }
    const parent = path6.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate templates/project tree");
}
async function deployLanguageProject(args) {
  if (args.language === "java" || args.language === "kotlin") {
    await deploySpringStarter({
      targetDir: args.targetDir,
      language: args.language,
      projectName: args.projectName,
      templatesDir: args.templatesDir,
      initializrClient: args.initializrClient,
      report: args.report
    });
    return;
  }
  const templatesDir = args.templatesDir ?? findTemplatesDir2();
  const langSrc = path6.join(templatesDir, args.language);
  if (!fs7.existsSync(langSrc)) {
    throw new Error(`No template found for language: ${args.language}`);
  }
  copyDirSubstituted(langSrc, args.targetDir, { projectName: args.projectName });
}

// scripts/lakebase/scaffold.ts
var cachedTemplatesDir3;
function findTemplatesDir3() {
  if (cachedTemplatesDir3) return cachedTemplatesDir3;
  const here = path7.dirname((0, import_node_url3.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path7.join(dir, "templates", "project");
    if (fs8.existsSync(path7.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir3 = candidate;
      return cachedTemplatesDir3;
    }
    const parent = path7.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. Pass explicit { templatesDir } to override.`
  );
}
function templatesRoot(opts) {
  return opts?.templatesDir ?? findTemplatesDir3();
}
function commonDir(opts) {
  return path7.join(templatesRoot(opts), "common");
}
function langDir(language, opts) {
  return path7.join(templatesRoot(opts), language);
}
function copyDir(srcDir, destDir, makeExecutable, relPrefix = "") {
  if (!fs8.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }
  fs8.mkdirSync(destDir, { recursive: true });
  const out = [];
  for (const entry of fs8.readdirSync(srcDir)) {
    const srcPath = path7.join(srcDir, entry);
    const destPath = path7.join(destDir, entry);
    const relPath = relPrefix ? path7.join(relPrefix, entry) : entry;
    if (fs8.statSync(srcPath).isDirectory()) {
      out.push(...copyDir(srcPath, destPath, makeExecutable, relPath));
    } else {
      fs8.copyFileSync(srcPath, destPath);
      if (makeExecutable) {
        fs8.chmodSync(destPath, 493);
      }
      out.push(relPath);
    }
  }
  return out;
}
async function deployScripts(targetDir, opts) {
  return copyDir(path7.join(commonDir(opts), "scripts"), path7.join(targetDir, "scripts"), true);
}
async function deployClaudeCommands(targetDir, opts) {
  const src = path7.join(commonDir(opts), ".claude", "commands");
  if (!fs8.existsSync(src)) {
    return { written: [], skipped: [] };
  }
  const destDir = path7.join(targetDir, ".claude", "commands");
  fs8.mkdirSync(destDir, { recursive: true });
  const version = kitVersion(opts);
  const written = [];
  const skipped = [];
  for (const entry of fs8.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const relDest = path7.join(".claude", "commands", entry);
    const destPath = path7.join(targetDir, relDest);
    if (fs8.existsSync(destPath) && !opts?.force) {
      skipped.push(relDest);
      continue;
    }
    const before = fs8.readFileSync(path7.join(src, entry), "utf-8");
    const after = before.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
    fs8.writeFileSync(destPath, after);
    written.push(relDest);
  }
  return { written, skipped };
}
async function deployClaudeAgents(targetDir, opts) {
  const kitRoot = path7.dirname(path7.dirname(templatesRoot(opts)));
  const src = path7.join(kitRoot, "skills", "lakebase-tdd-workflows", "agents");
  if (!fs8.existsSync(src)) {
    return { written: [], skipped: [] };
  }
  const destDir = path7.join(targetDir, ".claude", "agents");
  fs8.mkdirSync(destDir, { recursive: true });
  const written = [];
  const skipped = [];
  for (const entry of fs8.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const relDest = path7.join(".claude", "agents", entry);
    const destPath = path7.join(targetDir, relDest);
    if (fs8.existsSync(destPath) && !opts?.force) {
      skipped.push(relDest);
      continue;
    }
    fs8.copyFileSync(path7.join(src, entry), destPath);
    written.push(relDest);
  }
  return { written, skipped };
}
var PROJECT_SKILLS = [
  "software-design-principles",
  "lakebase-tdd-workflows",
  "lakebase-scm-workflows",
  "lakebase-release-workflows",
  "databricks-lakebase",
  "databricks-core"
];
async function deployClaudeSkills(targetDir, opts) {
  const kitRoot = path7.dirname(path7.dirname(templatesRoot(opts)));
  const written = [];
  const skipped = [];
  for (const skill of PROJECT_SKILLS) {
    const src = path7.join(kitRoot, "skills", skill);
    if (!fs8.existsSync(src)) continue;
    const relDest = path7.join(".claude", "skills", skill);
    const destPath = path7.join(targetDir, relDest);
    if (fs8.existsSync(destPath) && !opts?.force) {
      skipped.push(relDest);
      continue;
    }
    fs8.mkdirSync(path7.dirname(destPath), { recursive: true });
    fs8.cpSync(src, destPath, { recursive: true });
    written.push(relDest);
  }
  return { written, skipped };
}
async function deployWorkflows(targetDir, opts) {
  const written = copyDir(
    path7.join(commonDir(opts), ".github", "workflows"),
    path7.join(targetDir, ".github", "workflows"),
    false
  );
  substituteWorkflowPlaceholders(
    path7.join(targetDir, ".github", "workflows"),
    opts
  );
  return written;
}
function kitVersion(opts) {
  try {
    const kitRoot = path7.dirname(path7.dirname(templatesRoot(opts)));
    const raw = fs8.readFileSync(path7.join(kitRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function substituteWorkflowPlaceholders(workflowDir, opts) {
  if (!fs8.existsSync(workflowDir)) return;
  const version = kitVersion(opts);
  for (const entry of fs8.readdirSync(workflowDir)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const filePath = path7.join(workflowDir, entry);
    const before = fs8.readFileSync(filePath, "utf-8");
    const after = before.replace(/\{\{LAKEBASE_KIT_VERSION\}\}/g, version);
    if (after !== before) fs8.writeFileSync(filePath, after);
  }
}
async function installHooks(targetDir) {
  const scriptsDir = path7.join(targetDir, "scripts");
  const gitHooksDir = path7.join(targetDir, ".git", "hooks");
  if (!fs8.existsSync(path7.join(targetDir, ".git"))) {
    throw new Error(`Not a git repo root: ${targetDir}`);
  }
  fs8.mkdirSync(gitHooksDir, { recursive: true });
  cp2.execSync("git config --local core.hooksPath .git/hooks", {
    cwd: targetDir,
    stdio: "pipe"
  });
  const hookPairs = [
    ["post-checkout.sh", "post-checkout"],
    ["prepare-commit-msg.sh", "prepare-commit-msg"],
    ["pre-push.sh", "pre-push"],
    ["post-merge.sh", "post-merge"]
  ];
  const installed = [];
  for (const [srcName, hookName] of hookPairs) {
    const src = path7.join(scriptsDir, srcName);
    if (!fs8.existsSync(src)) continue;
    const dest = path7.join(gitHooksDir, hookName);
    fs8.copyFileSync(src, dest);
    fs8.chmodSync(dest, 493);
    installed.push(hookName);
  }
  return `Installed hooks: ${installed.join(", ") || "none"}`;
}
function renderEnvFromTemplate(args) {
  const src = path7.join(commonDir(args), ".env.example");
  let content = fs8.readFileSync(src, "utf-8");
  if (args.databricksHost) {
    content = content.replace(/DATABRICKS_HOST=.*/, `DATABRICKS_HOST=${args.databricksHost}`);
  }
  if (args.lakebaseProjectId) {
    content = content.replace(/LAKEBASE_PROJECT_ID=.*/, `LAKEBASE_PROJECT_ID=${args.lakebaseProjectId}`);
  }
  return content;
}
async function deployEnvExample(targetDir, args = {}) {
  fs8.writeFileSync(path7.join(targetDir, ".env.example"), renderEnvFromTemplate(args));
}
async function deployEnv(targetDir, args = {}) {
  fs8.writeFileSync(path7.join(targetDir, ".env"), renderEnvFromTemplate(args));
}
async function deployDeployTargets(targetDir, projectName, opts) {
  const src = path7.join(commonDir(opts), "deploy-targets.yaml");
  const dest = path7.join(targetDir, "deploy-targets.yaml");
  if (!fs8.existsSync(src)) return;
  let content = fs8.readFileSync(src, "utf-8");
  if (projectName) {
    content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
  }
  fs8.writeFileSync(dest, content);
}
async function deployVscodeSettings(targetDir, opts) {
  const src = path7.join(commonDir(opts), ".vscode", "settings.json");
  const destDir = path7.join(targetDir, ".vscode");
  fs8.mkdirSync(destDir, { recursive: true });
  fs8.copyFileSync(src, path7.join(destDir, "settings.json"));
}
async function deployGitignore(targetDir, language = "java", opts) {
  const base = fs8.readFileSync(path7.join(commonDir(opts), ".gitignore.base"), "utf-8");
  const extraPath = path7.join(langDir(language, opts), ".gitignore.extra");
  const extra = fs8.existsSync(extraPath) ? fs8.readFileSync(extraPath, "utf-8") : "";
  fs8.writeFileSync(path7.join(targetDir, ".gitignore"), base + "\n" + extra);
}
async function patchWorkflowsForRunnerType(targetDir, runnerType) {
  const workflowDir = path7.join(targetDir, ".github", "workflows");
  if (runnerType === "github-hosted") {
    for (const file of fs8.existsSync(workflowDir) ? fs8.readdirSync(workflowDir) : []) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const filePath = path7.join(workflowDir, file);
      let content = fs8.readFileSync(filePath, "utf-8");
      content = content.replace(/runs-on: self-hosted/g, "runs-on: ubuntu-latest");
      fs8.writeFileSync(filePath, content);
    }
    return;
  }
  const localJdkStep = [
    "- name: Set up JDK (probe local)",
    "        id: jdk-probe",
    "        if: steps.detect-lang.outputs.lang == 'java'",
    "        run: |",
    '          JH=""',
    '          if [ "$(uname)" = "Darwin" ]; then',
    '            JH="$(/usr/libexec/java_home 2>/dev/null || true)"',
    "          elif command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1; then",
    '            JH="$(dirname $(dirname $(readlink -f $(which java))))"',
    "          fi",
    '          if [ -n "$JH" ] && [ -x "$JH/bin/java" ]; then',
    '            echo "JAVA_HOME=$JH" >> $GITHUB_ENV',
    '            echo "local_jdk=found" >> $GITHUB_OUTPUT',
    '            echo "Using local JDK: $JH"',
    '            "$JH/bin/java" -version',
    "          else",
    '            echo "local_jdk=missing" >> $GITHUB_OUTPUT',
    '            echo "No local JDK; will fall back to actions/setup-java in the next step."',
    "          fi",
    "",
    "      - name: Set up JDK (download via actions/setup-java fallback)",
    "        if: steps.detect-lang.outputs.lang == 'java' && steps.jdk-probe.outputs.local_jdk == 'missing'",
    "        uses: actions/setup-java@v4",
    "        with:",
    "          java-version: '25'",
    "          distribution: 'temurin'",
    ""
  ].join("\n");
  for (const file of ["pr.yml", "merge.yml"]) {
    const filePath = path7.join(workflowDir, file);
    if (!fs8.existsSync(filePath)) continue;
    let content = fs8.readFileSync(filePath, "utf-8");
    content = content.replace(
      /- name: Set up JDK\n(?:\s+[\w-]+:.*\n)*\s+uses: actions\/setup-java@v4\n\s+with:\n(?:\s+#[^\n]*\n)*(?:\s+[\w-]+:.*\n)+/g,
      localJdkStep
    );
    fs8.writeFileSync(filePath, content);
  }
}
async function scaffoldStaticAll(args) {
  const report = args.report ?? (() => {
  });
  const language = args.language ?? "java";
  const runnerType = args.runnerType ?? "self-hosted";
  const opts = { templatesDir: args.templatesDir };
  report("Deploying .env.example");
  await deployEnvExample(args.targetDir, {
    ...opts,
    databricksHost: args.databricksHost,
    lakebaseProjectId: args.lakebaseProjectId
  });
  report("Deploying .env");
  await deployEnv(args.targetDir, {
    ...opts,
    databricksHost: args.databricksHost,
    lakebaseProjectId: args.lakebaseProjectId
  });
  report("Deploying .vscode/settings.json");
  await deployVscodeSettings(args.targetDir, opts);
  report("Deploying deploy-targets.yaml");
  await deployDeployTargets(args.targetDir, args.lakebaseProjectId, opts);
  report("Deploying .gitignore", language);
  await deployGitignore(args.targetDir, language, opts);
  report("Deploying scripts/");
  const scripts = await deployScripts(args.targetDir, opts);
  report("Deploying .github/workflows/");
  const workflows = await deployWorkflows(args.targetDir, opts);
  report("Patching workflows for runner type", runnerType);
  await patchWorkflowsForRunnerType(args.targetDir, runnerType);
  report("Installing git hooks");
  const hooksInstalled = await installHooks(args.targetDir);
  let claudeCommands = [];
  let claudeAgents = [];
  let claudeSkills = [];
  if (!args.skipCommands) {
    report("Deploying .claude/commands/");
    const cmd = await deployClaudeCommands(args.targetDir, opts);
    claudeCommands = cmd.written;
    report("Deploying .claude/agents/");
    const agents = await deployClaudeAgents(args.targetDir, opts);
    claudeAgents = agents.written;
    report("Deploying .claude/skills/ (software-design-principles)");
    const skills = await deployClaudeSkills(args.targetDir, opts);
    claudeSkills = skills.written;
  }
  return { scripts, workflows, hooksInstalled, claudeCommands, claudeAgents, claudeSkills };
}
async function scaffoldAll(args) {
  const report = args.report ?? (() => {
  });
  const language = args.language ?? "java";
  const projectName = args.lakebaseProjectId;
  const staticResult = await scaffoldStaticAll(args);
  report(`Deploying language project (${language})`);
  await deployLanguageProject({
    targetDir: args.targetDir,
    language,
    projectName,
    templatesDir: args.templatesDir,
    initializrClient: args.initializrClient,
    report
  });
  await deployGitignore(args.targetDir, language, { templatesDir: args.templatesDir });
  return staticResult;
}

// scripts/lakebase/long-running-branch.ts
init_cjs_shims();
var cp3 = __toESM(require("child_process"), 1);

// scripts/lakebase/branch-create.ts
init_cjs_shims();
var import_node_child_process6 = require("child_process");
var import_node_util3 = require("util");

// scripts/util/poll-until.ts
init_cjs_shims();

// scripts/util/delay.ts
init_cjs_shims();
function delay(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// scripts/util/poll-until.ts
async function pollUntil(args) {
  const now = args.now ?? (() => /* @__PURE__ */ new Date());
  const sleep = args.sleep ?? delay;
  const startedAt = now().getTime();
  let polls = 0;
  while (true) {
    const elapsedMs = now().getTime() - startedAt;
    if (elapsedMs >= args.timeoutMs && polls > 0) {
      return { outcome: "timeout", polls, elapsedMs };
    }
    polls += 1;
    const result = await args.probe({ pollIndex: polls, elapsedMs });
    const afterProbeElapsed = now().getTime() - startedAt;
    if (args.onPoll) {
      args.onPoll({ pollIndex: polls, elapsedMs: afterProbeElapsed, result });
    } else if (args.label && !result.done) {
      const seconds = Math.round(afterProbeElapsed / 1e3);
      console.log(
        `[${args.label}] still pending after ${seconds}s (poll ${polls})`
      );
    }
    if (result.done) {
      return {
        outcome: "done",
        value: result.value,
        polls,
        elapsedMs: afterProbeElapsed
      };
    }
    if (afterProbeElapsed >= args.timeoutMs) {
      return { outcome: "timeout", polls, elapsedMs: afterProbeElapsed };
    }
    await sleep(args.intervalMs);
  }
}
async function pollUntilDefined(probe, opts) {
  return pollUntil({
    ...opts,
    probe: async (ctx) => {
      const value = await probe(ctx);
      return value === void 0 ? { done: false } : { done: true, value };
    }
  });
}

// scripts/util/sanitize-branch-name.ts
init_cjs_shims();
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 63);
  while (name.length < 3) name += "-x";
  return name;
}

// scripts/lakebase/branch-create.ts
var execFileP3 = (0, import_node_util3.promisify)(import_node_child_process6.execFile);
async function createBranch(args) {
  const sanitized = sanitizeBranchName(args.branch);
  const lookup = { instance: args.instance, host: args.host };
  let sourceBranchPath;
  if (args.parentBranch) {
    if (looksLikeBranchUid(args.parentBranch)) {
      throw new LakebaseBranchError(
        `parentBranch '${args.parentBranch}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. Pass the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders') \u2013 the Lakebase API rejects uids in source_branch fields. If you have a uid and need to resolve it to its name, call resolveBranchId() from branch-utils first.`
      );
    }
    const validated = asBranchName(args.parentBranch);
    const parent = await getBranchByName(validated, lookup);
    if (parent) {
      sourceBranchPath = parent.name;
    } else if (args.strictParent === true) {
      throw new LakebaseBranchError(
        `parentBranch '${validated}' does not exist on project '${args.instance}', and strictParent: true was set. Either create '${validated}' first (e.g. cut it off the project default branch) or drop strictParent: true to fall back to the project default branch.`
      );
    } else {
      const def = await getDefaultBranch(lookup);
      if (!def) {
        throw new LakebaseBranchError(
          `parentBranch '${validated}' does not exist on project '${args.instance}' and the project has no default branch to fall back to.`
        );
      }
      const defaultLeaf = leafOf(def.name) ?? def.name;
      process.stderr.write(
        `[lakebase-branch-create] parentBranch '${validated}' not found on project '${args.instance}'; falling back to default branch '${defaultLeaf}'. Pass strictParent: true to throw instead.
`
      );
      sourceBranchPath = def.name;
    }
  } else if (args.currentBranch && args.currentBranch !== sanitized) {
    const current = await getBranchByName(args.currentBranch, lookup);
    if (current) sourceBranchPath = current.name;
  }
  if (!sourceBranchPath) {
    const def = await getDefaultBranch(lookup);
    if (!def) {
      throw new LakebaseBranchError(
        `Could not find a parent branch for "${sanitized}" \u2013 no parentBranch override, no currentBranch hint, and the project has no default branch.`
      );
    }
    sourceBranchPath = def.name;
  }
  const existing = await getBranchByName(sanitized, lookup);
  if (existing) {
    const existingLeaf = leafOf(existing.sourceBranchName);
    const requestedLeaf = leafOf(sourceBranchPath);
    if (existingLeaf && requestedLeaf && existingLeaf !== requestedLeaf) {
      throw new LakebaseBranchError(
        `Branch "${sanitized}" already exists, but was forked from "${existingLeaf}", not the requested "${requestedLeaf}". Delete the existing branch first, or pick a different target name.`
      );
    }
    return existing;
  }
  if (args.ttl && args.noExpiry === true) {
    throw new LakebaseBranchError(
      `Cannot set both ttl ("${args.ttl}") and noExpiry: true on the same branch \u2013 they are mutually exclusive. Pass one or the other.`
    );
  }
  const specObj = {
    source_branch: sourceBranchPath
  };
  if (args.ttl) {
    specObj.ttl = args.ttl;
  } else if (args.noExpiry ?? true) {
    specObj.no_expiry = true;
  }
  await createWithTtlRecovery(args.instance, sanitized, specObj, args.host);
  return waitForBranchReady({
    instance: args.instance,
    host: args.host,
    branch: sanitized,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
    pollIntervalMs: args.pollIntervalMs ?? KIT_TIMEOUTS.readyPoll
  });
}
async function waitForBranchReady(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.readyWait;
  const interval = args.pollIntervalMs ?? KIT_TIMEOUTS.readyPoll;
  const result = await pollUntilDefined(
    async () => {
      const branch = await getBranchByName(args.branch, { instance: args.instance, host: args.host });
      return branch && branch.state === "READY" ? branch : void 0;
    },
    { timeoutMs, intervalMs: interval }
  );
  if (result.outcome === "timeout") {
    throw new LakebaseBranchError(
      `Branch "${args.branch}" did not reach READY within ${timeoutMs}ms`
    );
  }
  return result.value;
}
function leafOf(pathOrName) {
  if (!pathOrName) return void 0;
  const segments = pathOrName.split("/");
  return segments[segments.length - 1] || void 0;
}
async function createWithTtlRecovery(instance, sanitized, specObj, host) {
  const originalTtl = specObj.ttl;
  try {
    await dbcli5(
      ["postgres", "create-branch", projectPath(instance), sanitized, "--json", JSON.stringify({ spec: specObj })],
      host
    );
    return;
  } catch (err) {
    if (!(err instanceof LakebaseBranchError) || !originalTtl || !isTtlTooLongError(err.message)) {
      throw err;
    }
    let retention = getCachedProjectRetention(instance);
    if (retention === void 0) {
      retention = await getProjectRetentionDuration({ projectId: instance, host });
      cacheProjectRetention(instance, retention);
    }
    const FALLBACK_TTL = "604800s";
    const effectiveRetention = retention ?? FALLBACK_TTL;
    const clamped = minLakebaseTtl(originalTtl, effectiveRetention) ?? effectiveRetention;
    if (clamped === originalTtl) {
      throw new LakebaseBranchTtlTooLongError(originalTtl, err.message);
    }
    process.stderr.write(
      `[lakebase-branch-create] workspace TTL cap rejected '${originalTtl}' for project '${instance}'; retrying with ` + (retention ? `retention-clamped '${clamped}'.
` : `hardcoded fallback '${clamped}' (history_retention_duration not discoverable).
`)
    );
    const retrySpec = { ...specObj, ttl: clamped };
    try {
      await dbcli5(
        ["postgres", "create-branch", projectPath(instance), sanitized, "--json", JSON.stringify({ spec: retrySpec })],
        host
      );
    } catch (retryErr) {
      if (retryErr instanceof LakebaseBranchError && isTtlTooLongError(retryErr.message)) {
        throw new LakebaseBranchTtlTooLongError(
          clamped,
          `Workspace rejected retention-clamped TTL '${clamped}' (original '${originalTtl}'): ${retryErr.message}`
        );
      }
      throw retryErr;
    }
  }
}
async function dbcli5(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP3("databricks", args, { env, timeout: KIT_TIMEOUTS.cliCreateBranch });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/long-running-branch.ts
async function createLongRunningBranch(args) {
  const created = await createBranch({
    instance: args.projectId,
    branch: args.name,
    // Long-running tiers (staging, uat, perf, ...) are permanent by
    // definition; without this they'd inherit Lakebase's default
    // expiry and silently disappear.
    noExpiry: true
  });
  const opts = { cwd: args.workTreeDir, stdio: "pipe" };
  cp3.execSync(`git fetch origin ${args.forkFromBranch}`, opts);
  cp3.execSync(`git checkout ${args.forkFromBranch}`, opts);
  cp3.execSync(`git pull --ff-only origin ${args.forkFromBranch}`, opts);
  cp3.execSync(`git branch -f ${args.name} ${args.forkFromBranch}`, opts);
  cp3.execSync(`git push -u origin ${args.name}`, opts);
  cp3.execSync(`git checkout ${args.name}`, opts);
  return {
    lakebaseBranchName: created.name ?? `projects/${args.projectId}/branches/${args.name}`,
    gitBranch: args.name,
    lakebase: created
  };
}

// scripts/lakebase/enable-e2e.ts
init_cjs_shims();
var fs10 = __toESM(require("fs"), 1);
var path9 = __toESM(require("path"), 1);

// scripts/lakebase/install-playwright.ts
init_cjs_shims();
var fs9 = __toESM(require("fs"), 1);
var path8 = __toESM(require("path"), 1);
var import_node_url4 = require("url");
var cachedTemplatesDir4;
function findTemplatesDir4() {
  if (cachedTemplatesDir4) return cachedTemplatesDir4;
  const here = path8.dirname((0, import_node_url4.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path8.join(dir, "templates", "project");
    if (fs9.existsSync(path8.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir4 = candidate;
      return cachedTemplatesDir4;
    }
    const parent = path8.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. Pass explicit { templatesDir } to override.`
  );
}
function commonDir2(opts) {
  return path8.join(opts?.templatesDir ?? findTemplatesDir4(), "common");
}
var PLAYWRIGHT_TEMPLATE_FILES = [
  "playwright.config.ts",
  path8.join("tests", "e2e", "smoke.spec.ts")
];
function writePlaywrightTemplates(args) {
  const src = commonDir2(args);
  const written = [];
  const skipped = [];
  for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
    const from = path8.join(src, rel);
    if (!fs9.existsSync(from)) {
      throw new Error(`Kit template missing: ${from}`);
    }
    const to = path8.join(args.projectDir, rel);
    if (fs9.existsSync(to) && !args.force) {
      skipped.push(rel);
      continue;
    }
    fs9.mkdirSync(path8.dirname(to), { recursive: true });
    fs9.copyFileSync(from, to);
    written.push(rel);
  }
  return { written, skipped };
}

// scripts/lakebase/enable-e2e.ts
var PLAYWRIGHT_TEST_VERSION_RANGE = "^1.49.0";
function addPlaywrightToPackageJson(args) {
  const pkgPath = path9.join(args.projectDir, "package.json");
  if (!fs10.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false, depAdded: false };
  }
  const range = args.versionRange ?? PLAYWRIGHT_TEST_VERSION_RANGE;
  const raw = fs10.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg.scripts ?? {};
  const devDependencies = pkg.devDependencies ?? {};
  let scriptAdded = false;
  if (!scripts["test:e2e"]) {
    scripts["test:e2e"] = "playwright test";
    scriptAdded = true;
  }
  let depAdded = false;
  if (!devDependencies["@playwright/test"]) {
    devDependencies["@playwright/test"] = range;
    depAdded = true;
  }
  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  if (scriptAdded || depAdded) {
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    fs10.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailingNewline, "utf8");
  }
  return { patched: true, scriptAdded, depAdded };
}
var RUN_TESTS_E2E_MARKER = "# run Playwright E2E suite when configured";
function addE2eToRunTestsScript(args) {
  const scriptPath = path9.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs10.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs10.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_E2E_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_E2E_MARKER,
    'if [ -f "$REPO_ROOT/playwright.config.ts" ] || [ -f "$REPO_ROOT/playwright.config.js" ]; then',
    '  echo "Running Playwright E2E tests..."',
    '  if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    '    (cd "$REPO_ROOT" && npm run test:e2e)',
    "  else",
    '    (cd "$REPO_ROOT" && npx --yes playwright test)',
    "  fi",
    "fi",
    ""
  ].join("\n");
  fs10.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}
function enableE2eForProject(args) {
  const rootPkg = path9.join(args.projectDir, "package.json");
  if (!fs10.existsSync(rootPkg)) {
    return {
      templatesWritten: [],
      // Same shape as writePlaywrightTemplates would have returned; the
      // template paths show up under skipped with the npm-wiring caveat
      // captured in packageJson.patched=false.
      templatesSkipped: [...PLAYWRIGHT_TEMPLATE_FILES],
      packageJson: { patched: false, scriptAdded: false, depAdded: false },
      runTestsScript: addE2eToRunTestsScript({ projectDir: args.projectDir })
    };
  }
  const templates = writePlaywrightTemplates({
    projectDir: args.projectDir,
    force: args.force,
    templatesDir: args.templatesDir
  });
  const packageJson = addPlaywrightToPackageJson({
    projectDir: args.projectDir,
    versionRange: args.versionRange
  });
  const runTestsScript = addE2eToRunTestsScript({ projectDir: args.projectDir });
  return {
    templatesWritten: templates.written,
    templatesSkipped: templates.skipped,
    packageJson,
    runTestsScript
  };
}

// scripts/lakebase/enable-infra.ts
init_cjs_shims();
var fs11 = __toESM(require("fs"), 1);
var path10 = __toESM(require("path"), 1);
var RUN_TESTS_INFRA_MARKER = "# Run Lakebase [Infra]-tag suite when wired";
function addInfraToPackageJson(args) {
  const pkgPath = path10.join(args.projectDir, "package.json");
  if (!fs11.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false };
  }
  const scriptValue = args.scriptValue ?? "npx --yes lakebase-infra-runner";
  const raw = fs11.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg.scripts ?? {};
  let scriptAdded = false;
  if (!scripts["test:infra"]) {
    scripts["test:infra"] = scriptValue;
    scriptAdded = true;
  }
  pkg.scripts = scripts;
  if (scriptAdded) {
    const trailing = raw.endsWith("\n") ? "\n" : "";
    fs11.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing, "utf8");
  }
  return { patched: true, scriptAdded };
}
function addInfraToRunTestsScript(args) {
  const scriptPath = path10.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs11.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs11.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_INFRA_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_INFRA_MARKER,
    'if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    `  if node -e "process.exit(!(require('./package.json').scripts && require('./package.json').scripts['test:infra']))" 2>/dev/null; then`,
    '    echo "Running Lakebase [Infra] suite..."',
    '    (cd "$REPO_ROOT" && npm run test:infra)',
    "  fi",
    "fi",
    ""
  ].join("\n");
  fs11.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}
function enableInfraForProject(args) {
  const packageJson = addInfraToPackageJson({
    projectDir: args.projectDir,
    scriptValue: args.scriptValue
  });
  const runTestsScript = addInfraToRunTestsScript({ projectDir: args.projectDir });
  return { packageJson, runTestsScript };
}

// scripts/lakebase/runner-setup.ts
init_cjs_shims();
var fs12 = __toESM(require("fs"), 1);
var os = __toESM(require("os"), 1);
var path11 = __toESM(require("path"), 1);
var cp4 = __toESM(require("child_process"), 1);
var tar = __toESM(require("tar"), 1);
var import_find_java_home = __toESM(require("find-java-home"), 1);
var import_tree_kill = __toESM(require("tree-kill"), 1);

// scripts/github/runner.ts
init_cjs_shims();
var import_octokit2 = require("octokit");
var GitHubRunnerError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubRunnerError";
    this.status = status;
  }
};
async function getOctokit() {
  const token = await resolveGitHubToken();
  return new import_octokit2.Octokit({ auth: token });
}
function wrap2(err, context) {
  if (err instanceof import_octokit2.RequestError) {
    throw new GitHubRunnerError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubRunnerError(`${context}: ${err.message}`);
  }
  throw new GitHubRunnerError(context);
}
async function createRegistrationToken(ownerRepo) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    const { data } = await octokit2.rest.actions.createRegistrationTokenForRepo({ owner, repo });
    if (!data.token) {
      throw new GitHubRunnerError("Registration token missing from GitHub response");
    }
    return data.token;
  } catch (err) {
    if (err instanceof GitHubRunnerError) throw err;
    if (err instanceof import_octokit2.RequestError && err.status === 404) {
      throw new GitHubRunnerError(
        `GitHub returned 404 for "${ownerRepo}". The signed-in user can't see this repo \u2013 it's likely private and owned by a different account. Sign in to GitHub as the repo owner (or set GITHUB_TOKEN to a token with access) and retry.`,
        404
      );
    }
    wrap2(err, "Failed to create runner registration token");
  }
}
async function listRepoRunners(ownerRepo) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    const { data } = await octokit2.rest.actions.listSelfHostedRunnersForRepo({ owner, repo });
    return (data.runners ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status
    }));
  } catch (err) {
    wrap2(err, `Failed to list runners for "${ownerRepo}"`);
  }
}
async function getRunnerIdByName(ownerRepo, runnerName2) {
  const runners = await listRepoRunners(ownerRepo);
  return runners.find((r) => r.name === runnerName2)?.id;
}
async function getRunnerStatus(ownerRepo, runnerName2) {
  const runners = await listRepoRunners(ownerRepo);
  return runners.find((r) => r.name === runnerName2)?.status;
}

// scripts/lakebase/runner-setup.ts
var RUNNER_VERSION = "2.333.1";
var RUNNER_ARCH = process.arch === "arm64" ? "arm64" : "x64";
var RUNNER_OS = process.platform === "darwin" ? "osx" : "linux";
var RUNNER_ARCHIVE = `actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz`;
var RUNNER_URL = `https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}`;
function cacheDir() {
  return path11.join(os.homedir(), ".cache", "github-actions-runner");
}
function runnersDir() {
  return path11.join(os.homedir(), ".lakebase", "runners");
}
function runnerDir(projectName) {
  return path11.join(runnersDir(), projectName);
}
function runnerName(projectName) {
  return `lakebase-${projectName}`;
}
async function ensureCachedArchive() {
  const dir = cacheDir();
  fs12.mkdirSync(dir, { recursive: true });
  const cachedPath = path11.join(dir, RUNNER_ARCHIVE);
  if (fs12.existsSync(cachedPath)) return cachedPath;
  const response = await fetch(RUNNER_URL);
  if (!response.ok) {
    throw new Error(`Failed to download runner: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs12.writeFileSync(cachedPath, buffer);
  return cachedPath;
}
async function resolveJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return new Promise((resolve2) => {
    (0, import_find_java_home.default)((err, javaHome) => resolve2(err ? void 0 : javaHome));
  });
}
var lastRunnerPid;
function stopRunner(projectName) {
  const dir = runnerDir(projectName);
  const pidFile = path11.join(dir, ".pid");
  let pid = lastRunnerPid;
  if (fs12.existsSync(pidFile)) {
    pid = parseInt(fs12.readFileSync(pidFile, "utf-8").trim(), 10);
    try {
      fs12.unlinkSync(pidFile);
    } catch {
    }
  }
  if (pid) {
    try {
      (0, import_tree_kill.default)(pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    }
  } else if (fs12.existsSync(dir)) {
    try {
      cp4.execSync(`pkill -9 -f "${dir.replace(/\//g, "\\/")}.*Runner" 2>/dev/null || true`, {
        timeout: KIT_TIMEOUTS.cmdShort
      });
    } catch {
    }
  }
  lastRunnerPid = void 0;
  for (const stale of ["_diag/pages", "_work/_temp", "_work/_actions"]) {
    const full = path11.join(dir, stale);
    if (fs12.existsSync(full)) {
      try {
        fs12.rmSync(full, { recursive: true, force: true });
      } catch {
      }
    }
  }
  try {
    fs12.mkdirSync(path11.join(dir, "_diag", "pages"), { recursive: true });
  } catch {
  }
}
function resetRunnerConfig(dir, projectName) {
  const stateFiles = [
    ".runner",
    ".credentials",
    ".credentials_rsaparams",
    ".path",
    ".service",
    "svc.sh",
    ".runner_migrated"
  ];
  for (const f of stateFiles) {
    try {
      fs12.unlinkSync(path11.join(dir, f));
    } catch {
    }
  }
  if (process.platform === "darwin") {
    const plist = path11.join(
      os.homedir(),
      "Library",
      "LaunchAgents",
      `actions.runner.${projectName}.plist`
    );
    if (fs12.existsSync(plist)) {
      try {
        cp4.execFileSync("launchctl", ["unload", plist], { stdio: "ignore" });
      } catch {
      }
      try {
        fs12.unlinkSync(plist);
      } catch {
      }
    }
  }
}
async function setupRunner(args) {
  const report = args.report ?? (() => {
  });
  const dir = runnerDir(args.projectName);
  const name = runnerName(args.projectName);
  stopRunner(args.projectName);
  report("Downloading runner binary...");
  const archive = await ensureCachedArchive();
  fs12.mkdirSync(dir, { recursive: true });
  if (!fs12.existsSync(path11.join(dir, "config.sh"))) {
    report("Extracting runner...");
    await tar.extract({ file: archive, cwd: dir });
  }
  const diagPages = path11.join(dir, "_diag", "pages");
  if (fs12.existsSync(diagPages)) {
    fs12.rmSync(diagPages, { recursive: true, force: true });
    fs12.mkdirSync(diagPages, { recursive: true });
  }
  const runnerFile = path11.join(dir, ".runner");
  let needsConfig = !fs12.existsSync(runnerFile);
  if (needsConfig) {
    resetRunnerConfig(dir, args.projectName);
  } else {
    let urlMismatch = false;
    try {
      const runnerJson = JSON.parse(fs12.readFileSync(runnerFile, "utf-8"));
      const configuredUrl = runnerJson.gitHubUrl || runnerJson.serverUrl || runnerJson.agentUrl || "";
      const expectedUrl = `https://github.com/${args.fullRepoName}`;
      urlMismatch = !!configuredUrl && !configuredUrl.startsWith(expectedUrl);
    } catch {
      urlMismatch = true;
    }
    if (urlMismatch) {
      report("Runner configured against a different repo \u2013 resetting...");
      resetRunnerConfig(dir, args.projectName);
      needsConfig = true;
    } else {
      try {
        const id = await getRunnerIdByName(args.fullRepoName, name);
        if (!id) {
          report("Runner registration stale \u2013 reconfiguring...");
          resetRunnerConfig(dir, args.projectName);
          needsConfig = true;
        } else {
          report("Runner already configured \u2013 restarting...");
        }
      } catch {
        report("Could not verify runner \u2013 reconfiguring...");
        resetRunnerConfig(dir, args.projectName);
        needsConfig = true;
      }
    }
  }
  if (needsConfig) {
    report("Registering runner with GitHub...");
    const regToken = await createRegistrationToken(args.fullRepoName);
    cp4.execSync(
      `./config.sh --url "https://github.com/${args.fullRepoName}" --token "${regToken}" --name "${name}" --labels self-hosted --unattended --replace`,
      { cwd: dir, timeout: KIT_TIMEOUTS.cliLong }
    );
  }
  report("Starting runner...");
  const env = { ...process.env };
  const javaHome = await resolveJavaHome();
  if (javaHome && !env.JAVA_HOME) env.JAVA_HOME = javaHome;
  const child = cp4.spawn("./run.sh", [], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env
  });
  child.unref();
  lastRunnerPid = child.pid;
  if (child.pid) {
    fs12.writeFileSync(path11.join(dir, ".pid"), String(child.pid));
  }
  report("Waiting for runner to come online...");
  let online = false;
  for (let i = 0; i < 12; i++) {
    try {
      const status = await getRunnerStatus(args.fullRepoName, name);
      if (status === "online") {
        online = true;
        break;
      }
    } catch {
    }
    await delay(5e3);
  }
  if (!online) {
    throw new Error(`Runner "${name}" did not come online within 60 seconds`);
  }
  report("Runner is online.");
  return { name, dir, pid: child.pid, online: true };
}

// scripts/util/ci-secrets.ts
init_cjs_shims();

// scripts/github/secrets.ts
init_cjs_shims();
var import_octokit3 = require("octokit");
var import_tweetsodium = __toESM(require("tweetsodium"), 1);
var GitHubSecretsError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubSecretsError";
    this.status = status;
  }
};
async function getOctokit2() {
  const token = await resolveGitHubToken();
  return new import_octokit3.Octokit({ auth: token });
}
function wrap3(err, context) {
  if (err instanceof import_octokit3.RequestError) {
    throw new GitHubSecretsError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubSecretsError(`${context}: ${err.message}`);
  }
  throw new GitHubSecretsError(context);
}
function encryptSecret(publicKey, secretValue) {
  const keyBytes = Buffer.from(publicKey, "base64");
  const messageBytes = Buffer.from(secretValue);
  const encryptedBytes = import_tweetsodium.default.seal(messageBytes, keyBytes);
  return Buffer.from(encryptedBytes).toString("base64");
}
async function setRepoSecret(ownerRepo, secretName, secretValue) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit2();
    const { data: keyData } = await octokit2.rest.actions.getRepoPublicKey({ owner, repo });
    const encryptedValue = encryptSecret(keyData.key, secretValue);
    await octokit2.rest.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: secretName,
      encrypted_value: encryptedValue,
      key_id: keyData.key_id
    });
  } catch (err) {
    if (err instanceof GitHubSecretsError) throw err;
    wrap3(err, `Failed to set secret ${secretName} on ${ownerRepo}`);
  }
}
async function setRepoSecrets(ownerRepo, secrets) {
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) {
      throw new GitHubSecretsError(`Missing value for secret ${name}`);
    }
  }
  for (const [name, value] of Object.entries(secrets)) {
    await setRepoSecret(ownerRepo, name, value);
  }
}

// scripts/git/remote.ts
init_cjs_shims();
async function getGitHubUrl(cwd) {
  try {
    const url = (await exec2("git remote get-url origin", { cwd, timeout: 5e3 })).trim();
    return url.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/").replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  } catch {
    return "";
  }
}
async function getOwnerRepo(cwd) {
  const url = await getGitHubUrl(cwd);
  if (!url) return "";
  try {
    const { owner, repo } = parseOwnerRepo(url);
    return formatOwnerRepo(owner, repo);
  } catch {
    return "";
  }
}

// scripts/util/ci-secrets.ts
async function syncCiSecrets(args) {
  const lifetime = args.lifetimeSeconds ?? 86400;
  const comment = args.comment ?? "GitHub Actions CI";
  const ownerRepo = args.ownerRepo ?? await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new Error("Could not resolve GitHub repository from git remote");
  }
  if (!args.databricksHost) {
    throw new Error("syncCiSecrets: databricksHost is required");
  }
  if (!args.lakebaseProjectId) {
    throw new Error("syncCiSecrets: lakebaseProjectId is required");
  }
  const secrets = {
    DATABRICKS_HOST: args.databricksHost,
    LAKEBASE_PROJECT_ID: args.lakebaseProjectId
  };
  try {
    const tokenRaw = await exec2(
      `databricks tokens create --comment "${comment}" --lifetime-seconds ${lifetime} -o json`,
      { cwd: args.projectDir, timeout: 3e4, env: { DATABRICKS_HOST: args.databricksHost } }
    );
    const parsed = JSON.parse(tokenRaw);
    const token = parsed.token_value || parsed.token || "";
    if (token) secrets.DATABRICKS_TOKEN = token;
  } catch {
  }
  await setRepoSecrets(ownerRepo, secrets);
}

// scripts/lakebase/scm-workflow-state.ts
init_cjs_shims();
var fs13 = __toESM(require("fs"), 1);
var path12 = __toESM(require("path"), 1);
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
  return path12.join(projectDir, STATE_FILE_REL);
}
function writeWorkflowState(projectDir, state) {
  const result = validateWorkflowState(state);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Refusing to write invalid SCM state:
${summary}`);
  }
  const dir = path12.join(projectDir, ".lakebase");
  fs13.mkdirSync(dir, { recursive: true });
  const target = stateFilePath(projectDir);
  const tmp = `${target}.tmp`;
  const ordered = orderForOutput(result.value);
  fs13.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}
`, "utf8");
  fs13.renameSync(tmp, target);
}
function initWorkflowState(args) {
  return {
    $schema: "./scm-workflow-state.schema.json",
    version: 1,
    state: "scaffold-complete",
    tier_topology: args.tierTopology,
    project_id: args.projectId
  };
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
function orderForOutput(state) {
  const keyOrder = [
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
  ];
  const out = {};
  for (const k of keyOrder) {
    if (state[k] !== void 0) {
      out[k] = state[k];
    }
  }
  return out;
}

// scripts/tdd/agent-models.ts
init_cjs_shims();
var import_fs = require("fs");
var import_path = require("path");
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
var AGENT_CONFIG_REL = (0, import_path.join)(".lakebase", "agent-config.json");
function buildAgentConfig(overrides) {
  const roles = {};
  for (const role of ALL_AGENT_ROLES) {
    const recommended = RECOMMENDED_MODELS[role];
    const ov = overrides?.[role];
    const entry = { recommended };
    if (ov && ov !== recommended) entry.override = ov;
    roles[role] = entry;
  }
  return { version: 1, roles };
}
function writeAgentConfig(projectDir, config) {
  const p = (0, import_path.join)(projectDir, AGENT_CONFIG_REL);
  (0, import_fs.mkdirSync)((0, import_path.dirname)(p), { recursive: true });
  (0, import_fs.writeFileSync)(p, JSON.stringify(config, null, 2) + "\n");
}

// scripts/lakebase/create-project.ts
async function createProject(input, progress) {
  const report = progress ?? (() => {
  });
  const projectDir = path13.join(input.parentDir, input.projectName);
  const lakebaseProjectId = input.projectName;
  const host = input.databricksHost.replace(/\/+$/, "");
  const useGithub = input.createGithubRepo !== false;
  const language = input.language ?? "java";
  const runnerType = input.runnerType ?? "self-hosted";
  const enableTdd = input.enableTdd !== false;
  const enableE2e = input.enableE2e !== void 0 ? input.enableE2e : language === "nodejs";
  const enableInfra = input.enableInfra !== void 0 ? input.enableInfra : language === "nodejs";
  const skipCommands = input.skipCommands === true;
  const tiers = input.tiers;
  const warnings = [];
  if (useGithub && !input.githubOwner) {
    throw new Error("GitHub owner is required when creating a GitHub repository");
  }
  const fullRepoName = input.githubOwner ? `${input.githubOwner}/${input.projectName}` : "";
  if (useGithub) {
    report("Creating GitHub repository...", fullRepoName);
    await createRepo(fullRepoName, {
      private: input.privateRepo !== false,
      description: `Lakebase project: ${input.projectName}`
    });
    report("Waiting for GitHub repo to be visible...", fullRepoName);
    const probeDelays = [1e3, 2e3, 3e3, 5e3, 8e3];
    let probeErr = "";
    let visible = false;
    for (const waitMs of probeDelays) {
      try {
        await getRepoFullName(fullRepoName);
        visible = true;
        break;
      } catch (err) {
        probeErr = err instanceof Error ? err.message : String(err);
        await delay(waitMs);
      }
    }
    if (!visible) {
      let activeUser = "";
      try {
        activeUser = await getCurrentUser();
      } catch {
      }
      const samlHint = /SAML|scope does not match|sso/i.test(probeErr) ? "\n\nThe error mentions SAML \u2013 re-sign in to GitHub and authorize SSO for this org." : "";
      const userHint = activeUser && activeUser !== input.githubOwner ? `

Note: signed in as "${activeUser}", but the repo was created under "${input.githubOwner}".` : "";
      throw new Error(
        `GitHub repo "${fullRepoName}" was created but isn't visible after ~19s of polling.${samlHint}${userHint}

Last probe error:
  ${probeErr.split("\n")[0].slice(0, 200)}`
      );
    }
    report("Cloning repository...", projectDir);
    await cloneRepo({
      repoUrl: `https://github.com/${fullRepoName}.git`,
      parentDir: input.parentDir
    });
  } else {
    report("Creating local project directory...", projectDir);
    if (fs14.existsSync(projectDir)) {
      throw new Error(`Directory already exists: ${projectDir}`);
    }
    fs14.mkdirSync(projectDir, { recursive: true });
    await gitInit(projectDir);
  }
  report("Creating Lakebase database...", lakebaseProjectId);
  await createLakebaseProject({ projectId: lakebaseProjectId, host });
  report("Resolving database endpoint...");
  const defaultBranchId = await getDefaultBranchId({
    projectId: lakebaseProjectId,
    host
  });
  report("Scaffolding project files...");
  await scaffoldAll({
    targetDir: projectDir,
    databricksHost: host,
    lakebaseProjectId,
    language,
    runnerType,
    skipCommands,
    report: (m, d) => report(m, d)
  });
  if (enableTdd) {
    report("Scaffolding .tdd/ workflow directory...");
    layDownTddScaffold(projectDir);
  }
  if (enableE2e) {
    report("Wiring Playwright E2E support...");
    const e2e = enableE2eForProject({ projectDir });
    if (e2e.templatesWritten.length > 0) {
      report(`  wrote ${e2e.templatesWritten.length} Playwright template(s)`);
    }
    if (e2e.packageJson.patched && (e2e.packageJson.scriptAdded || e2e.packageJson.depAdded)) {
      report("  patched package.json (test:e2e + @playwright/test)");
    } else if (!e2e.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (e2e.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh");
    }
  }
  if (enableInfra) {
    report("Wiring [Infra]-tag runner support...");
    const infra = enableInfraForProject({ projectDir });
    if (infra.packageJson.patched && infra.packageJson.scriptAdded) {
      report("  patched package.json (test:infra)");
    } else if (!infra.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (infra.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh (infra block)");
    }
  }
  if (useGithub) {
    report("Setting up CI auth (service principal)...");
    try {
      await syncCiSecrets({
        projectDir,
        databricksHost: host,
        lakebaseProjectId,
        comment: "GitHub Actions CI",
        lifetimeSeconds: 86400,
        ownerRepo: fullRepoName
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`CI auth setup failed: ${msg}`);
      report(`Warning: CI auth setup failed (${msg})`);
    }
  }
  if (useGithub && runnerType === "self-hosted") {
    report("Setting up self-hosted runner...");
    try {
      await setupRunner({
        fullRepoName,
        projectName: input.projectName,
        report: (m) => report(m)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Runner setup failed: ${msg}`);
      report(`Warning: runner setup failed (${msg}). CI workflows will queue until a runner is available.`);
    }
  } else if (useGithub) {
    report("Using GitHub-hosted runners \u2013 no local runner needed.");
  } else {
    report("Skipping runner setup (no GitHub repository).");
  }
  try {
    writeWorkflowState(
      projectDir,
      initWorkflowState({
        projectId: lakebaseProjectId,
        tierTopology: tiers ?? 1
      })
    );
  } catch (err) {
    warnings.push(
      `SCM workflow-state seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. Run lakebase-scm-state to inspect.`
    );
  }
  if (enableTdd) {
    try {
      writeAgentConfig(projectDir, buildAgentConfig(input.agentModels));
    } catch (err) {
      warnings.push(
        `Agent model config seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. The role defaults still apply.`
      );
    }
  }
  if (enableTdd) {
    try {
      const kitRef = process.env.LAKEBASE_KIT_REF?.trim();
      if (kitRef) {
        const dir = path13.join(projectDir, ".lakebase");
        fs14.mkdirSync(dir, { recursive: true });
        fs14.writeFileSync(path13.join(dir, "kit-ref"), `${kitRef}
`, "utf8");
      }
      const lk = path13.join(projectDir, "scripts", "lk");
      if (fs14.existsSync(lk)) {
        (0, import_node_child_process7.spawnSync)("bash", [lk, "--warm"], { cwd: projectDir, stdio: "ignore", timeout: 18e4 });
      }
    } catch (err) {
      warnings.push(
        `Kit fast-CLI cache warm failed (advisory): ${err instanceof Error ? err.message : String(err)}. scripts/lk installs lazily on first use.`
      );
    }
  }
  const langLabels = {
    java: "Java/Spring Boot",
    kotlin: "Kotlin/Spring Boot",
    python: "Python/FastAPI",
    nodejs: "Node.js/Express"
  };
  const langLabel = langLabels[language] ?? language;
  report("Creating initial commit...");
  await commitAndPush({
    projectDir,
    message: `Initial project scaffold (${langLabel} + Lakebase)`,
    push: useGithub
  });
  if (tiers === 2 || tiers === 3) {
    if (!useGithub) {
      warnings.push(
        `tiers === ${tiers} requires a GitHub repository (createLongRunningBranch pushes the tier's git side to origin). Extra tiers were NOT cut.`
      );
    } else {
      report(`Cutting staging tier (tiers=${tiers}) via createLongRunningBranch...`);
      try {
        await createLongRunningBranch({
          name: "staging",
          forkFromBranch: "main",
          projectId: lakebaseProjectId,
          workTreeDir: projectDir,
          databricksHost: host
        });
      } catch (err) {
        warnings.push(
          `tiers === ${tiers} requested but createLongRunningBranch for staging failed: ${err instanceof Error ? err.message : String(err)}.`
        );
      }
      if (tiers === 3) {
        report("Cutting dev tier (tiers=3) via createLongRunningBranch (off staging)...");
        try {
          await createLongRunningBranch({
            name: "dev",
            forkFromBranch: "staging",
            projectId: lakebaseProjectId,
            workTreeDir: projectDir,
            databricksHost: host
          });
        } catch (err) {
          warnings.push(
            `tiers === 3 requested but createLongRunningBranch for dev failed: ${err instanceof Error ? err.message : String(err)}.`
          );
        }
      }
    }
  }
  report("Verifying project...");
  const health = verifyProject(projectDir);
  for (const w of health.warnings) {
    warnings.push(w);
    report(`Warning: ${w}`);
  }
  report("Project created successfully!");
  if (enableTdd) {
    report(`Next: cd ${projectDir} && ./scripts/tdd.sh plan`);
  }
  return {
    projectDir,
    githubRepoUrl: useGithub ? `https://github.com/${fullRepoName}` : void 0,
    lakebaseProjectId,
    lakebaseDefaultBranch: defaultBranchId,
    warnings
  };
}
function layDownTddScaffold(targetDir) {
  const candidates = [
    path13.resolve(__dirname, "../../templates/tdd-bootstrap/.tdd"),
    path13.resolve(__dirname, "../../../templates/tdd-bootstrap/.tdd")
  ];
  const source = candidates.find((c) => fs14.existsSync(c));
  if (!source) {
    throw new Error(`tdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path13.join(targetDir, ".tdd");
  if (fs14.existsSync(dest)) {
    return;
  }
  fs14.cpSync(source, dest, { recursive: true });
}

// scripts/lakebase/schema-migrate.ts
init_cjs_shims();
var fs20 = __toESM(require("fs"), 1);
var path20 = __toESM(require("path"), 1);

// scripts/lakebase/adapters/alembic-adapter.ts
init_cjs_shims();
var fs16 = __toESM(require("fs"), 1);
var path15 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/alembic.ts
init_cjs_shims();
var import_node_child_process8 = require("child_process");
var fs15 = __toESM(require("fs"), 1);
var path14 = __toESM(require("path"), 1);
function resolveAlembicBin(projectDir) {
  const candidates = [
    path14.join(projectDir, ".venv", "bin", "alembic"),
    path14.join(projectDir, "venv", "bin", "alembic")
  ];
  for (const candidate of candidates) {
    try {
      if (fs15.existsSync(candidate)) return candidate;
    } catch {
    }
  }
  return "alembic";
}
function spawnAlembic(projectDir, args, dsn) {
  return new Promise((resolve2, reject) => {
    const bin = resolveAlembicBin(projectDir);
    const child = (0, import_node_child_process8.spawn)(bin, args, {
      cwd: projectDir,
      env: dsn ? { ...process.env, DATABASE_URL: dsn } : { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn alembic. Is it installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `alembic ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function runAlembic(ctx, args) {
  return spawnAlembic(ctx.projectDir, args, ctx.dsn);
}
async function createAlembicRevision(opts) {
  const args = ["revision", "--rev-id", opts.revId, "-m", opts.message];
  if (opts.autogenerate) args.push("--autogenerate");
  const { stdout } = await spawnAlembic(opts.projectDir, args, opts.dsn);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (m) return m[1].trim();
  for (const rel of ["migrations/versions", "alembic/versions"]) {
    const dir = path14.join(opts.projectDir, rel);
    if (!fs15.existsSync(dir)) continue;
    const hit = fs15.readdirSync(dir).find((f) => f.startsWith(`${opts.revId}_`) && f.endsWith(".py"));
    if (hit) return path14.join(dir, hit);
  }
  throw new SchemaMigrationError(
    `alembic revision succeeded but the created file could not be located.
stdout: ${stdout}`
  );
}
async function listAlembicHeads(projectDir) {
  const { stdout } = await spawnAlembic(projectDir, ["heads"]);
  const heads = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]+)\b/);
    if (m) heads.push(m[1]);
  }
  return heads;
}
async function mergeAlembicHeads(projectDir, message) {
  const { stdout } = await spawnAlembic(projectDir, ["merge", "-m", message, "heads"]);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (!m) {
    throw new SchemaMigrationError(`alembic merge heads created no file.
stdout: ${stdout}`);
  }
  return m[1].trim();
}
async function getCurrentRevision(ctx) {
  const { stdout } = await runAlembic(ctx, ["current"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : void 0;
}
async function getHeadRevision(ctx) {
  const { stdout } = await runAlembic(ctx, ["heads"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : void 0;
}
async function listHistory(ctx, range) {
  const { stdout } = await runAlembic(ctx, ["history", "-r", range]);
  const out = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(?:<base>|[a-f0-9]+)\s*->\s*([a-f0-9]+)(?:\s*\(head\))?,\s*(.*)$/);
    if (m) out.push({ version: m[1].trim(), description: m[2].trim() });
  }
  return out;
}
async function applyAlembic(ctx) {
  const before = await getCurrentRevision(ctx);
  await runAlembic(ctx, ["upgrade", "head"]);
  const after = await getCurrentRevision(ctx);
  if (!after || before === after) {
    return { applied: [], alreadyAtLatest: true, tool: "alembic" };
  }
  const range = before ? `${before}:${after}` : `base:${after}`;
  const inRange = await listHistory(ctx, range);
  const applied = before ? inRange.filter((a) => a.version !== before) : inRange;
  return { applied, alreadyAtLatest: false, tool: "alembic" };
}
async function rollbackAlembic(ctx) {
  const before = await getCurrentRevision(ctx);
  if (!before) {
    await runAlembic(ctx, ["downgrade", ctx.target]);
    return { rolledBack: [], tool: "alembic" };
  }
  await runAlembic(ctx, ["downgrade", ctx.target]);
  const after = await getCurrentRevision(ctx);
  const range = after ? `${after}:${before}` : `base:${before}`;
  const inRange = await listHistory(ctx, range);
  const rolledBack = after ? inRange.filter((a) => a.version !== after) : inRange;
  return { rolledBack, tool: "alembic" };
}
async function statusAlembic(ctx) {
  const current = await getCurrentRevision(ctx);
  const head = await getHeadRevision(ctx);
  const pending = [];
  if (head && head !== current) {
    const range = current ? `${current}:head` : `base:head`;
    const inRange = await listHistory(ctx, range);
    for (const rev of inRange) {
      if (current && rev.version === current) continue;
      pending.push({
        version: rev.version,
        filename: `${rev.version}_*.py`,
        description: rev.description
      });
    }
  }
  return { current, pending, tool: "alembic" };
}

// scripts/lakebase/schema-migration-adapter.ts
init_cjs_shims();
var REGISTRY = /* @__PURE__ */ new Map();
function registerSchemaMigrationAdapter(adapter) {
  REGISTRY.set(adapter.id, adapter);
}
function resolveSchemaMigrationAdapter(projectDir, override) {
  if (override) {
    const a = REGISTRY.get(override);
    if (!a) {
      throw new UnresolvedSchemaMigrationAdapterError(
        `migration_tool=${override} is not a registered adapter. Registered: ${[...REGISTRY.keys()].join(", ") || "(none)"}`
      );
    }
    return a;
  }
  for (const adapter of REGISTRY.values()) {
    if (adapter.detect(projectDir)) return adapter;
  }
  throw new UnresolvedSchemaMigrationAdapterError(
    `Cannot resolve migration tool for ${projectDir}. Set project.yaml#migration_tool to one of: ${[...REGISTRY.keys()].join(", ") || "(none)"}.`
  );
}
var UnresolvedSchemaMigrationAdapterError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnresolvedSchemaMigrationAdapterError";
  }
};

// scripts/lakebase/adapters/alembic-adapter.ts
async function buildDsn(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
function findVersionsDir(projectDir) {
  const candidates = [
    path15.join(projectDir, "migrations", "versions"),
    path15.join(projectDir, "alembic", "versions")
  ];
  return candidates.find((p) => fs16.existsSync(p));
}
function listAlembicFiles(projectDir) {
  const dir = findVersionsDir(projectDir);
  if (!dir) return [];
  const files = fs16.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep = stem.indexOf("_");
    const version = sep === -1 ? stem : stem.slice(0, sep);
    const description = sep === -1 ? "" : stem.slice(sep + 1).replace(/_/g, " ");
    return {
      version,
      filename,
      description,
      type: "Python",
      tool: "alembic"
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
var AlembicAdapter = {
  id: "alembic",
  languages: ["python"],
  /**
   * Detect Alembic-specifically rather than Python-broadly. A project
   * with pyproject.toml but no alembic.ini and no env.py is a Python
   * project that hasn't (yet) adopted Alembic, and should NOT auto-route
   * here. Callers can still force-select via project.yaml#migration_tool.
   */
  detect(projectDir) {
    if (fs16.existsSync(path15.join(projectDir, "alembic.ini"))) return true;
    if (fs16.existsSync(path15.join(projectDir, "migrations", "env.py"))) return true;
    if (fs16.existsSync(path15.join(projectDir, "alembic", "env.py"))) return true;
    return false;
  },
  async apply(args) {
    const dsn = await buildDsn(args);
    try {
      const legacy = await applyAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async rollback(args) {
    const dsn = await buildDsn(args);
    try {
      const legacy = await rollbackAlembic({
        projectDir: args.projectDir,
        dsn,
        target: args.target
      });
      return {
        rolled_back: legacy.rolledBack,
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async status(args) {
    const dsn = await buildDsn(args);
    try {
      const legacy = await statusAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        // The legacy statusAlembic returns current + pending, not the
        // full applied history. Surface what we have. Backfilling the
        // applied list requires an extra `alembic history -r base:current`
        // call; deferred to a follow-up so this slice stays a pure port.
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listAlembicFiles(args.projectDir) };
  },
  // baseline intentionally absent in slice 3. Alembic exposes `stamp`
  // as the equivalent operation; deferred to a follow-up.
  async newMigration(args) {
    try {
      if (args.autogenerate && (!args.instance || !args.branch)) {
        throw new Error("autogenerate requires both instance and branch (to diff models vs the branch DB)");
      }
      const revId = migrationTimestamp();
      const dsn = args.autogenerate ? await buildDsn({
        instance: args.instance,
        branch: args.branch,
        database: args.database,
        endpointName: args.endpointName
      }) : void 0;
      const created = await createAlembicRevision({
        projectDir: args.projectDir,
        revId,
        message: args.slug,
        autogenerate: !!args.autogenerate,
        dsn
      });
      return { status: "ok", version: revId, filename: path15.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async collapseHeads(args) {
    try {
      const heads = await listAlembicHeads(args.projectDir);
      if (heads.length <= 1) return { status: "noop", headsBefore: heads };
      if (args.dryRun) return { status: "ok", headsBefore: heads };
      const created = await mergeAlembicHeads(args.projectDir, args.message ?? "merge heads");
      const mergeRevision = path15.basename(created).replace(/\.py$/, "").split("_")[0];
      return { status: "ok", headsBefore: heads, mergeRevision, path: created };
    } catch (err) {
      return {
        status: "error",
        headsBefore: [],
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(AlembicAdapter);

// scripts/lakebase/adapters/flyway-adapter.ts
init_cjs_shims();
var fs17 = __toESM(require("fs"), 1);
var path17 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/flyway.ts
init_cjs_shims();
var import_node_child_process9 = require("child_process");
var path16 = __toESM(require("path"), 1);
function dsnToFlywayEnv(dsn) {
  const u = new URL(dsn);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  const portPart = u.port ? `:${u.port}` : "";
  const url = `jdbc:postgresql://${u.hostname}${portPart}${u.pathname}${u.search}`;
  return { url, user, password };
}
function migrationsLocation(projectDir) {
  return `filesystem:${path16.join(projectDir, "src", "main", "resources", "db", "migration")}`;
}
function runFlyway(ctx, args) {
  const { url, user, password } = dsnToFlywayEnv(ctx.dsn);
  return new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process9.spawn)(
      "flyway",
      ["-outputType=json", `-locations=${migrationsLocation(ctx.projectDir)}`, ...args],
      {
        cwd: ctx.projectDir,
        env: {
          ...process.env,
          FLYWAY_URL: url,
          FLYWAY_USER: user,
          FLYWAY_PASSWORD: password
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn flyway. Is the Flyway Community CLI installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `flyway ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function parseFlywayJson(stdout) {
  const start = stdout.indexOf("{");
  if (start === -1) {
    throw new SchemaMigrationError(`flyway JSON output missing: ${stdout.slice(0, 200)}`);
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch (err) {
    throw new SchemaMigrationError(
      `flyway JSON parse failed: ${err instanceof Error ? err.message : String(err)}.
Body (first 400 chars): ${stdout.slice(start, start + 400)}`
    );
  }
}
async function applyFlyway(ctx) {
  const { stdout } = await runFlyway(ctx, [
    "-baselineOnMigrate=true",
    "-baselineVersion=0",
    "migrate"
  ]);
  const json = parseFlywayJson(stdout);
  const entries = json.migrations ?? [];
  const applied = [];
  for (const m of entries) {
    if (m.category === "INIT") continue;
    if (m.state && m.state !== "SUCCESS") continue;
    if (!m.version) continue;
    applied.push({
      version: m.version,
      description: m.description ?? "",
      ...typeof m.executionTime === "number" ? { executionTimeMs: m.executionTime } : {}
    });
  }
  return {
    applied,
    alreadyAtLatest: applied.length === 0,
    tool: "flyway"
  };
}
async function statusFlyway(ctx) {
  const { stdout } = await runFlyway(ctx, ["info"]);
  const json = parseFlywayJson(stdout);
  const entries = json.migrations ?? [];
  let current;
  const pending = [];
  for (const m of entries) {
    if (!m.version) continue;
    const state = (m.state ?? "").toUpperCase();
    if (state === "SUCCESS" || state === "BASELINE") {
      current = m.version;
    } else if (state === "PENDING") {
      const filename = m.filepath ? path16.basename(m.filepath) : `V${m.version}__migration.sql`;
      pending.push({
        version: m.version,
        filename,
        description: m.description ?? ""
      });
    }
  }
  return { current, pending, tool: "flyway" };
}

// scripts/lakebase/adapters/flyway-adapter.ts
async function buildDsn2(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
function listFlywayFiles(projectDir) {
  const dir = path17.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs17.existsSync(dir)) return [];
  const files = fs17.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare(a.version, b.version));
}
function versionCompare(a, b) {
  const ax = a.split(".").map(Number);
  const bx = b.split(".").map(Number);
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
var FlywayAdapter = {
  id: "flyway",
  languages: ["java", "kotlin"],
  detect(projectDir) {
    return fs17.existsSync(path17.join(projectDir, "pom.xml"));
  },
  async apply(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await applyFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  // rollback intentionally absent: Flyway Community Edition does not
  // support it. Callers MUST property-check (`adapter.rollback?` /
  // `if (adapter.rollback)`) before invoking.
  async status(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await statusFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        // Legacy statusFlyway does not return the applied history; we
        // surface only the currently-applied version + pending. Adapters
        // that complete this (Alembic, future Knex) MAY populate.
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listFlywayFiles(args.projectDir) };
  },
  // baseline intentionally absent. Flyway DOES support baseline at the
  // tool level, but exposing it cleanly requires plumbing flags into the
  // existing runner. Deferred to a follow-up slice; the adapter's
  // optional-protocol shape makes this additive.
  async newMigration(args) {
    try {
      const dir = path17.join(args.projectDir, "src", "main", "resources", "db", "migration");
      fs17.mkdirSync(dir, { recursive: true });
      const version = migrationTimestamp();
      const slug = migrationSlug2(args.slug);
      const filename = `V${version}__${slug}.sql`;
      const full = path17.join(dir, filename);
      if (fs17.existsSync(full)) throw new Error(`${filename} already exists`);
      fs17.writeFileSync(
        full,
        `-- V${version}: ${args.slug}
-- Flyway migration (write your DDL/DML below).
`,
        "utf8"
      );
      return { status: "ok", version, filename, path: full };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(FlywayAdapter);

// scripts/lakebase/adapters/knex-adapter.ts
init_cjs_shims();
var fs19 = __toESM(require("fs"), 1);
var path19 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/knex.ts
init_cjs_shims();
var import_node_child_process10 = require("child_process");
var fs18 = __toESM(require("fs"), 1);
var path18 = __toESM(require("path"), 1);
var KNEXFILE_VARIANTS = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function findKnexfile(projectDir) {
  for (const name of KNEXFILE_VARIANTS) {
    const p = path18.join(projectDir, name);
    if (fs18.existsSync(p)) return p;
  }
  return void 0;
}
function spawnKnex(projectDir, args, dsn) {
  return new Promise((resolve2, reject) => {
    const knexfile = findKnexfile(projectDir);
    if (!knexfile) {
      reject(
        new SchemaMigrationError(
          `No knexfile found in ${projectDir}. Expected one of: ${KNEXFILE_VARIANTS.join(", ")}.`
        )
      );
      return;
    }
    const child = (0, import_node_child_process10.spawn)("npx", ["--no-install", "knex", "--knexfile", knexfile, ...args], {
      cwd: projectDir,
      env: dsn ? { ...process.env, DATABASE_URL: dsn } : { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn knex via npx. Is Node installed and is 'knex' in the project's node_modules? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `knex ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function runKnex(ctx, args) {
  return spawnKnex(ctx.projectDir, args, ctx.dsn);
}
async function createKnexMigration(opts) {
  const { stdout } = await spawnKnex(opts.projectDir, ["migrate:make", opts.slug]);
  const m = stdout.match(/Created Migration:\s*(\S+)/);
  if (m) return m[1].trim();
  throw new SchemaMigrationError(
    `knex migrate:make succeeded but the created file could not be located.
stdout: ${stdout}`
  );
}
function parseKnexStatus(stdout) {
  const completed = [];
  const pending = [];
  let mode = null;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^Found\s+\d+\s+Completed\s+Migration/i.test(line)) {
      mode = "completed";
      continue;
    }
    if (/^Found\s+\d+\s+Pending\s+Migration/i.test(line)) {
      mode = "pending";
      continue;
    }
    if (/^No\s+Pending\s+Migration\s+files\s+Found/i.test(line)) {
      mode = null;
      continue;
    }
    if (!line) continue;
    if (!/\.(js|ts|mjs|cjs)$/.test(line)) continue;
    if (mode === "completed") completed.push(line);
    if (mode === "pending") pending.push(line);
  }
  return { completed, pending };
}
function parseKnexFilename(filename) {
  const stem = filename.replace(/\.(js|ts|mjs|cjs)$/, "");
  const m = stem.match(/^(\d{14})_(.+)$/);
  const version = m ? m[1] : stem;
  const description = m ? m[2].replace(/[_-]/g, " ") : stem;
  return { version, description };
}
async function applyKnex(ctx) {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  await runKnex(ctx, ["migrate:latest"]);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);
  const newlyCompleted = after.completed.filter((f) => !before.completed.includes(f));
  if (newlyCompleted.length === 0) {
    return { applied: [], alreadyAtLatest: true, tool: "knex" };
  }
  const applied = newlyCompleted.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { applied, alreadyAtLatest: false, tool: "knex" };
}
async function rollbackKnex(ctx) {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  const rollbackArgs = ["migrate:rollback"];
  if (ctx.target === "all" || ctx.target === "0") {
    rollbackArgs.push("--all");
  }
  await runKnex(ctx, rollbackArgs);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);
  const rolledBackFiles = before.completed.filter((f) => !after.completed.includes(f));
  const rolledBack = rolledBackFiles.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { rolledBack, tool: "knex" };
}
async function statusKnex(ctx) {
  const { stdout } = await runKnex(ctx, ["migrate:status"]);
  const { completed, pending } = parseKnexStatus(stdout);
  const current = completed.length > 0 ? parseKnexFilename(completed[completed.length - 1]).version : void 0;
  const pendingOut = pending.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, filename, description };
  });
  return { current, pending: pendingOut, tool: "knex" };
}

// scripts/lakebase/adapters/knex-adapter.ts
async function buildDsn3(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
var KNEXFILE_VARIANTS2 = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function listKnexFiles(projectDir) {
  const dir = path19.join(projectDir, "migrations");
  if (!fs19.existsSync(dir)) return [];
  const files = fs19.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files.map((filename) => {
    const stem = filename.replace(/\.(js|ts)$/, "");
    const m = stem.match(/^(\d{14})_(.+)$/);
    const version = m ? m[1] : stem;
    const description = m ? m[2].replace(/[_-]/g, " ") : stem;
    const type = filename.endsWith(".ts") ? "TypeScript" : "JavaScript";
    return { version, filename, description, type, tool: "knex" };
  }).sort((a, b) => a.version.localeCompare(b.version));
}
var KnexAdapter = {
  id: "knex",
  languages: ["nodejs"],
  /**
   * A knexfile at the project root is the canonical Knex marker. A bare
   * package.json with no knexfile means "Node.js project, but not Knex"
   * and should NOT auto-route here. Callers can still force-select via
   * project.yaml#migration_tool.
   */
  detect(projectDir) {
    return KNEXFILE_VARIANTS2.some((name) => fs19.existsSync(path19.join(projectDir, name)));
  },
  async apply(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await applyKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async rollback(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await rollbackKnex({
        projectDir: args.projectDir,
        dsn,
        target: args.target
      });
      return {
        rolled_back: legacy.rolledBack,
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async status(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await statusKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listKnexFiles(args.projectDir) };
  },
  // baseline intentionally absent. Knex has no native baseline concept;
  // omitting it advertises that correctly via the optional-capability
  // protocol so callers won't attempt the operation.
  async newMigration(args) {
    try {
      const created = await createKnexMigration({ projectDir: args.projectDir, slug: migrationSlug2(args.slug) });
      const stem = path19.basename(created).replace(/\.(js|ts)$/, "");
      const version = stem.match(/^(\d{14})_/)?.[1] ?? stem;
      return { status: "ok", version, filename: path19.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(KnexAdapter);

// scripts/lakebase/schema-migrate.ts
var SchemaMigrationError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "SchemaMigrationError";
  }
  cause;
};
function detectLanguage(projectDir) {
  if (fs20.existsSync(path20.join(projectDir, "pom.xml"))) {
    return "java";
  }
  if (fs20.existsSync(path20.join(projectDir, "pyproject.toml")) || fs20.existsSync(path20.join(projectDir, "requirements.txt")) || fs20.existsSync(path20.join(projectDir, "alembic.ini"))) {
    return "python";
  }
  if (fs20.existsSync(path20.join(projectDir, "package.json"))) {
    return "nodejs";
  }
  throw new SchemaMigrationError(
    `Could not detect project language in ${projectDir}. Expected one of: pom.xml (java/kotlin), pyproject.toml or alembic.ini (python), package.json (nodejs). Pass {language} explicitly to override.`
  );
}
function toolForLanguage(language) {
  switch (language) {
    case "java":
    case "kotlin":
      return "flyway";
    case "python":
      return "alembic";
    case "nodejs":
      return "knex";
  }
}
function listSchemaMigrations(args = {}) {
  const projectDir = args.projectDir ?? process.cwd();
  const language = args.language ?? detectLanguage(projectDir);
  const tool = toolForLanguage(language);
  switch (tool) {
    case "flyway":
      return listFlywayMigrations(projectDir);
    case "alembic":
      return listAlembicMigrations(projectDir);
    case "knex":
      return listKnexMigrations(projectDir);
  }
}
function listFlywayMigrations(projectDir) {
  const dir = path20.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs20.existsSync(dir)) return [];
  const files = fs20.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare2(a.version, b.version));
}
function listAlembicMigrations(projectDir) {
  const candidates = [
    path20.join(projectDir, "migrations", "versions"),
    path20.join(projectDir, "alembic", "versions")
  ];
  const dir = candidates.find((p) => fs20.existsSync(p));
  if (!dir) return [];
  const files = fs20.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep = stem.indexOf("_");
    const version = sep === -1 ? stem : stem.slice(0, sep);
    const description = sep === -1 ? "" : stem.slice(sep + 1).replace(/_/g, " ");
    return { version, filename, description, type: "Python", tool: "alembic" };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
function listKnexMigrations(projectDir) {
  const dir = path20.join(projectDir, "migrations");
  if (!fs20.existsSync(dir)) return [];
  const files = fs20.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files.map((filename) => {
    const stem = filename.replace(/\.(js|ts)$/, "");
    const m = stem.match(/^(\d{14})_(.+)$/);
    const version = m ? m[1] : stem;
    const description = m ? m[2].replace(/[_-]/g, " ") : stem;
    const type = filename.endsWith(".ts") ? "TypeScript" : "JavaScript";
    return { version, filename, description, type, tool: "knex" };
  }).sort((a, b) => a.version.localeCompare(b.version));
}
function versionCompare2(a, b) {
  const ax = a.split(".").map(Number);
  const bx = b.split(".").map(Number);
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
function adapterFor(projectDir, language) {
  const override = language ? toolForLanguage(language) : void 0;
  return resolveSchemaMigrationAdapter(projectDir, override);
}
async function applySchemaMigrations(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.apply({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "apply failed");
  }
  return {
    applied: r.applied_migrations,
    alreadyAtLatest: r.status === "noop",
    tool: adapter.id
  };
}
async function rollbackSchemaMigration(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.rollback) {
    throw new SchemaMigrationError(
      `Adapter '${adapter.id}' does not support rollback. (Flyway Community Edition has no \`undo\`; other adapters may omit rollback by design.)`
    );
  }
  const r = await adapter.rollback({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    target: args.target,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "rollback failed");
  }
  return {
    rolledBack: r.rolled_back,
    tool: adapter.id
  };
}
async function schemaMigrationStatus(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.status({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "status failed");
  }
  return {
    current: r.applied_version ?? void 0,
    pending: r.pending,
    tool: adapter.id
  };
}
function migrationTimestamp(now = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}
function migrationSlug2(description) {
  return description.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "migration";
}

// scripts/tdd/feature-status.ts
init_cjs_shims();
var import_fs7 = require("fs");
var import_path6 = require("path");

// scripts/tdd/test-list.ts
init_cjs_shims();
var import_fs2 = require("fs");

// scripts/tdd/tdd-paths.ts
init_cjs_shims();
var fs21 = __toESM(require("fs"), 1);
var import_node_path = require("path");
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureTestListJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "test-list.json");
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs21.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs21.existsSync(exact)) return exact;
  const matches = fs21.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyPlanJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "plan.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs21.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs21.existsSync(exact)) return exact;
  const matches = fs21.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
function requireFeatureDir(tdd, featureId) {
  const dir = findFeatureDir(tdd, featureId);
  if (!dir) throw new Error(`feature ${featureId} not found (or ambiguous) under ${featuresDir(tdd)}`);
  return dir;
}

// scripts/tdd/test-list.ts
function readMasterTestList(tddDir, featureId) {
  requireFeatureDir(tddDir, featureId);
  const file = featureTestListJson(tddDir, featureId);
  if (!(0, import_fs2.existsSync)(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  const parsed = JSON.parse((0, import_fs2.readFileSync)(file, "utf8"));
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
}

// scripts/tdd/design-spec-gate.ts
init_cjs_shims();
var import_fs4 = require("fs");

// scripts/tdd/run-cycle.ts
init_cjs_shims();

// scripts/tdd/experiment.ts
init_cjs_shims();
var import_fs3 = require("fs");
var import_path2 = require("path");

// scripts/lakebase/paired-branch.ts
init_cjs_shims();
var fs23 = __toESM(require("fs"), 1);
var path21 = __toESM(require("path"), 1);
var import_node_child_process13 = require("child_process");

// scripts/lakebase/branch-delete.ts
init_cjs_shims();
var import_node_child_process11 = require("child_process");
var import_node_util4 = require("util");
var execFileP4 = (0, import_node_util4.promisify)(import_node_child_process11.execFile);
async function deleteBranch(args) {
  const fullPath = await resolveBranchPath(args.branch, {
    instance: args.instance,
    host: args.host
  });
  if (!fullPath) {
    throw new LakebaseBranchError(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  if (!args.allowDefault) {
    const info = await getBranchByName(args.branch, {
      instance: args.instance,
      host: args.host
    });
    if (info?.isDefault) {
      const leaf = info.name.split("/branches/").pop() ?? info.uid;
      throw new LakebaseBranchError(
        `Refusing to delete the project's default Lakebase branch "${leaf}". This branch is the trunk every other branch was forked from. Pass allowDefault=true (or --allow-default on the CLI) only when you intend to tear down the entire project.`
      );
    }
  }
  await dbcli6(["postgres", "delete-branch", fullPath], args.host);
}
async function dbcli6(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP4("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/branch-endpoint.ts
init_cjs_shims();
var import_node_child_process12 = require("child_process");
async function getEndpoint(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    return void 0;
  }
  let raw;
  try {
    raw = (0, import_node_child_process12.execFileSync)("databricks", ["postgres", "list-endpoints", branchPath, "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault
    });
  } catch {
    return void 0;
  }
  let endpoints;
  try {
    endpoints = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return void 0;
  }
  const ep = endpoints[0];
  return {
    host: ep?.status?.hosts?.host ?? "",
    state: ep?.status?.current_state ?? "UNKNOWN"
  };
}
function endpointPath(instance, branch, endpointName = DEFAULT_ENDPOINT) {
  return `projects/${instance}/branches/${branch}/endpoints/${endpointName}`;
}
async function ensureEndpoint(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const existing = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
  if (existing?.host) {
    return existing;
  }
  const branchPath = `projects/${args.instance}/branches/${branchId}`;
  const spec = {
    spec: {
      endpoint_type: args.endpointType ?? "ENDPOINT_TYPE_READ_WRITE",
      autoscaling_limit_min_cu: args.autoscalingMinCu ?? 2,
      autoscaling_limit_max_cu: args.autoscalingMaxCu ?? 4
    }
  };
  try {
    (0, import_node_child_process12.execFileSync)(
      "databricks",
      ["postgres", "create-endpoint", branchPath, endpointName, "--json", JSON.stringify(spec)],
      { stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.cliCreateEndpoint }
    );
  } catch (err) {
    const racy = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
    if (racy?.host) return racy;
    throw err;
  }
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.readyWait;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ep = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
    if (ep?.host) return ep;
    await new Promise((r) => setTimeout(r, KIT_TIMEOUTS.readyPoll));
  }
  throw new Error(
    `Endpoint for ${branchPath} did not reach ACTIVE within ${timeoutMs}ms (create succeeded but no host yet)`
  );
}
async function getCredential(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    throw new Error(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  return mintCredential(`${branchPath}/endpoints/${endpointName}`);
}

// scripts/lakebase/databricks-profile.ts
init_cjs_shims();
var fs22 = __toESM(require("fs"), 1);
function normalizeHost(host) {
  return host.trim().replace(/\/+$/, "").toLowerCase();
}
function selectProfileForHost(profilesJson, host) {
  const target = normalizeHost(host);
  if (!target) return void 0;
  const start = profilesJson.indexOf("{");
  if (start < 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(profilesJson.slice(start));
  } catch {
    return void 0;
  }
  const profiles = parsed.profiles;
  if (!Array.isArray(profiles)) return void 0;
  const names = profiles.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const rec = p;
    return typeof rec.name === "string" && typeof rec.host === "string" && rec.valid === true && normalizeHost(rec.host) === target;
  }).map((p) => p.name);
  const distinct = Array.from(new Set(names));
  return distinct.length === 1 ? distinct[0] : void 0;
}
async function resolveProfileForHost(host, timeoutMs = KIT_TIMEOUTS.cliDefault) {
  if (!normalizeHost(host)) return void 0;
  let out;
  try {
    out = await exec2("databricks auth profiles -o json", { timeout: timeoutMs });
  } catch {
    return void 0;
  }
  return selectProfileForHost(out, host);
}
async function ensureProfilePinned(args) {
  const { envPath } = args;
  if (!fs22.existsSync(envPath)) return { reason: "no-env" };
  const lines = fs22.readFileSync(envPath, "utf-8").split("\n");
  const startsWithKey = (line, key) => line.trimStart().startsWith(`${key}=`);
  if (lines.some((l) => startsWithKey(l, "DATABRICKS_CONFIG_PROFILE"))) {
    return { reason: "already-pinned" };
  }
  const hostIdx = lines.findIndex((l) => startsWithKey(l, "DATABRICKS_HOST"));
  if (hostIdx < 0) return { reason: "no-host" };
  const hostLine = lines[hostIdx];
  const host = hostLine.slice(hostLine.indexOf("=") + 1).trim();
  if (!host) return { reason: "no-host" };
  const resolve2 = args.resolve ?? ((h) => resolveProfileForHost(h));
  const profile = await resolve2(host);
  if (!profile) return { reason: "no-match" };
  lines.splice(hostIdx + 1, 0, `DATABRICKS_CONFIG_PROFILE=${profile}`);
  fs22.writeFileSync(envPath, lines.join("\n"));
  return { pinned: profile };
}

// scripts/lakebase/paired-branch.ts
function gitCurrentBranch(cwd) {
  return (0, import_node_child_process13.execFileSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault
  }).trim();
}
function gitHasLocalBranch(cwd, branch) {
  try {
    (0, import_node_child_process13.execFileSync)("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      stdio: "ignore",
      timeout: KIT_TIMEOUTS.gitDefault
    });
    return true;
  } catch {
    return false;
  }
}
function gitCheckoutNewBranch(cwd, branch) {
  (0, import_node_child_process13.execFileSync)("git", ["checkout", "-b", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitCheckoutExistingBranch(cwd, branch) {
  (0, import_node_child_process13.execFileSync)("git", ["checkout", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitDeleteLocalBranch(cwd, branch, force = true) {
  (0, import_node_child_process13.execFileSync)("git", ["branch", force ? "-D" : "-d", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault
  });
}
function gitHasRemoteBranch(cwd, remote, branch) {
  try {
    const out = (0, import_node_child_process13.execFileSync)(
      "git",
      ["ls-remote", "--exit-code", "--heads", remote, branch],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.gitNetwork }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
function gitDeleteRemoteBranch(cwd, remote, branch) {
  (0, import_node_child_process13.execFileSync)("git", ["push", remote, "--delete", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitPush
  });
}
function readEnvVar(envPath, key) {
  if (!fs23.existsSync(envPath)) return void 0;
  const content = fs23.readFileSync(envPath, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return void 0;
  return match[1].trim().replace(/^["']|["']$/g, "");
}
function buildDsn4(host, database, user, password) {
  const u = new URL(`postgresql://${host}:${POSTGRES_PORT}/${encodeURIComponent(database)}`);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}
async function createPairedBranch(args) {
  const warnings = [];
  const sanitized = sanitizeBranchName(args.branch);
  const createGitBranch = args.createGitBranch !== false;
  const syncEnv = args.syncEnv !== false;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branch = await createBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch,
    ttl: args.ttl,
    noExpiry: args.noExpiry
  });
  let ready = branch;
  if (branch.state !== "READY") {
    try {
      ready = await waitForBranchReady({
        instance: args.instance,
        branch: sanitized,
        timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
      });
    } catch (err) {
      warnings.push(
        `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let gitBranchCreated = false;
  if (createGitBranch) {
    try {
      if (gitHasLocalBranch(args.cwd, sanitized)) {
        gitCheckoutExistingBranch(args.cwd, sanitized);
      } else {
        gitCheckoutNewBranch(args.cwd, sanitized);
        gitBranchCreated = true;
      }
    } catch (err) {
      warnings.push(
        `Failed to create/switch git branch "${sanitized}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let envSynced = false;
  if (syncEnv && ready.state === "READY") {
    try {
      const ep = await getEndpoint({ instance: args.instance, branch: sanitized });
      if (!ep?.host) {
        warnings.push(`Endpoint not yet available for "${sanitized}" \u2013 .env not updated`);
      } else {
        const { token, email } = await mintCredential(endpointPath(args.instance, sanitized));
        const dsn = buildDsn4(ep.host, database, email, token);
        const envPath = path21.join(args.cwd, ".env");
        updateEnvConnection({
          envPath,
          branchId: sanitized,
          databaseUrl: dsn,
          username: email,
          password: token,
          endpointHost: ep.host
        });
        await ensureProfilePinned({ envPath }).catch(() => void 0);
        envSynced = true;
      }
    } catch (err) {
      warnings.push(
        `.env sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return {
    branch: ready,
    gitBranch: sanitized,
    gitBranchCreated,
    envSynced,
    warnings
  };
}
async function deletePairedBranch(args) {
  const warnings = [];
  const sanitized = sanitizeBranchName(args.branch);
  const deleteGitLocal = args.deleteGitLocal !== false;
  const deleteGitRemote = args.deleteGitRemote !== false;
  const gitRemote = args.gitRemote ?? "origin";
  let lakebaseDeleted = false;
  try {
    await deleteBranch({ instance: args.instance, branch: sanitized });
    lakebaseDeleted = true;
  } catch (err) {
    warnings.push(
      `Lakebase delete failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  let gitLocalDeleted = false;
  if (deleteGitLocal) {
    try {
      const current = gitCurrentBranch(args.cwd);
      if (current === sanitized) {
        warnings.push(`Skipped local git delete: branch "${sanitized}" is currently checked out`);
      } else if (!gitHasLocalBranch(args.cwd, sanitized)) {
        gitLocalDeleted = true;
      } else {
        gitDeleteLocalBranch(args.cwd, sanitized, true);
        gitLocalDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Local git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let gitRemoteDeleted = false;
  if (deleteGitRemote) {
    try {
      if (gitHasRemoteBranch(args.cwd, gitRemote, sanitized)) {
        gitDeleteRemoteBranch(args.cwd, gitRemote, sanitized);
        gitRemoteDeleted = true;
      } else {
        gitRemoteDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Remote git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return { lakebaseDeleted, gitLocalDeleted, gitRemoteDeleted, warnings };
}
async function syncEnvToCurrentBranch(args) {
  const envPath = path21.join(args.cwd, ".env");
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance id (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  const trunkAlias = args.trunkAlias?.trim();
  const isTrunk = trunkAlias && rawBranch === trunkAlias || !trunkAlias && (rawBranch === "main" || rawBranch === "master");
  let sanitized;
  if (isTrunk) {
    const lakebaseBranches = await listBranches({ instance });
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    sanitized = def.name.split("/branches/").pop() ?? def.uid;
  } else {
    sanitized = sanitizeBranchName(rawBranch);
  }
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const ep = await getEndpoint({ instance, branch: sanitized });
  if (!ep?.host) {
    throw new Error(
      `No endpoint host yet for branch "${sanitized}" in instance "${instance}" \u2013 branch may still be provisioning`
    );
  }
  const { token, email } = await getCredential({ instance, branch: sanitized });
  const dsn = buildDsn4(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    branchId: sanitized,
    databaseUrl: dsn,
    username: email,
    password: token,
    endpointHost: ep.host
  });
  await ensureProfilePinned({ envPath }).catch(() => void 0);
  return { branchId: sanitized, endpointHost: ep.host, databaseUrl: dsn };
}
async function checkoutPaired(args) {
  const warnings = [];
  const envPath = path21.join(args.cwd, ".env");
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  if (!rawBranch || rawBranch === "HEAD") {
    throw new Error(
      `Cannot resolve current git branch (detached HEAD or not a git repo at ${args.cwd})`
    );
  }
  const branchId = sanitizeBranchName(rawBranch);
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const previousBranch = args.previousBranch ?? readEnvVar(envPath, "LAKEBASE_BRANCH_ID") ?? "";
  const trunkAlias = args.trunkAlias?.trim();
  let mode = "feature";
  let lakebaseBranch = branchId;
  const isTrunkAlias = trunkAlias && rawBranch === trunkAlias;
  const isMainOrMaster = !trunkAlias && (rawBranch === "main" || rawBranch === "master");
  const lakebaseBranches = await listBranches({ instance });
  const tierMatch = isTier(rawBranch, lakebaseBranches);
  if (isTrunkAlias || isMainOrMaster) {
    mode = "trunk";
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    lakebaseBranch = def.name.split("/branches/").pop() ?? def.uid;
  } else if (tierMatch) {
    mode = "tier";
    lakebaseBranch = rawBranch;
  } else {
    let existing = await getBranchByName(branchId, { instance });
    if (!existing) {
      if (args.autoCreate !== false) {
        const parentBranch = await resolveFeatureParent({
          instance,
          target: branchId,
          baseBranch: args.baseBranch,
          previousBranch
        });
        const created = await createBranch({
          instance,
          branch: rawBranch,
          parentBranch
        });
        if (created.state !== "READY") {
          try {
            await waitForBranchReady({
              instance,
              branch: branchId,
              timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
            });
          } catch (err) {
            warnings.push(
              `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        existing = await getBranchByName(branchId, { instance });
        mode = "feature-created";
      } else {
        throw new Error(
          `Lakebase branch "${branchId}" does not exist and autoCreate=false`
        );
      }
    }
    lakebaseBranch = branchId;
  }
  const ep = await ensureEndpoint({
    instance,
    branch: lakebaseBranch,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
  });
  const { token, email } = await mintCredential(endpointPath(instance, lakebaseBranch));
  const dsn = buildDsn4(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    branchId: lakebaseBranch,
    databaseUrl: dsn,
    username: email,
    password: token,
    endpointHost: ep.host
  });
  await ensureProfilePinned({ envPath }).catch(() => void 0);
  return {
    branchId,
    mode,
    matchedLakebaseBranch: lakebaseBranch,
    endpointHost: ep.host,
    databaseUrl: dsn,
    envUpdated: true,
    warnings
  };
}
async function resolveFeatureParent(args) {
  if (args.baseBranch) {
    return args.baseBranch;
  }
  if (args.previousBranch && args.previousBranch !== args.target) {
    const prev = await getBranchByName(args.previousBranch, { instance: args.instance });
    if (prev) {
      return args.previousBranch;
    }
  }
  return void 0;
}

// scripts/tdd/experiment.ts
function experimentsRoot(tddDir, featureId, storyId) {
  return (0, import_path2.join)(tddDir, "experiments", featureId, storyId);
}
function experimentDir(tddDir, featureId, storyId, slug) {
  return (0, import_path2.join)(experimentsRoot(tddDir, featureId, storyId), slug);
}
function listExperimentStories(tddDir, featureId) {
  const root = (0, import_path2.join)(tddDir, "experiments", featureId);
  if (!(0, import_fs3.existsSync)(root)) return [];
  return (0, import_fs3.readdirSync)(root).filter((d) => (0, import_fs3.statSync)((0, import_path2.join)(root, d)).isDirectory()).sort();
}
function listExperiments(tddDir, featureId, storyId) {
  const root = experimentsRoot(tddDir, featureId, storyId);
  if (!(0, import_fs3.existsSync)(root)) return [];
  const out = [];
  for (const slug of (0, import_fs3.readdirSync)(root)) {
    const dir = (0, import_path2.join)(root, slug);
    if (!(0, import_fs3.statSync)(dir).isDirectory()) continue;
    const branchFile = (0, import_path2.join)(dir, "branch.txt");
    if (!(0, import_fs3.existsSync)(branchFile)) continue;
    out.push({
      feature_id: featureId,
      story_id: storyId,
      experiment_slug: slug,
      branch_id: (0, import_fs3.readFileSync)(branchFile, "utf8").trim(),
      created_at: (0, import_fs3.statSync)(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
function readOutcomes(tddDir, featureId, storyId, slug) {
  const file = (0, import_path2.join)(experimentDir(tddDir, featureId, storyId, slug), "outcomes.json");
  if (!(0, import_fs3.existsSync)(file)) return null;
  return JSON.parse((0, import_fs3.readFileSync)(file, "utf8"));
}

// scripts/tdd/agent-log.ts
init_cjs_shims();

// scripts/tdd/schema-loader.ts
init_cjs_shims();
var import_path3 = require("path");
var import_ajv = __toESM(require_ajv(), 1);
var SCHEMA_DIR = (0, import_path3.join)(__dirname, "schemas");
var ajv = new import_ajv.default({ allErrors: true, strict: false });

// scripts/tdd/spike-carryforward.ts
init_cjs_shims();

// scripts/tdd/design-spec-gate.ts
function readPlan(tddDir, featureId, storyId) {
  const planPath = storyPlanJson(tddDir, featureId, storyId);
  if (!(0, import_fs4.existsSync)(planPath)) return null;
  return JSON.parse((0, import_fs4.readFileSync)(planPath, "utf8"));
}

// scripts/tdd/smells.ts
init_cjs_shims();
var import_fs5 = require("fs");
var import_path4 = require("path");
function readSmellsLog(tddDir) {
  const file = (0, import_path4.join)(tddDir, "smells.json");
  if (!(0, import_fs5.existsSync)(file)) return { detected: [] };
  return JSON.parse((0, import_fs5.readFileSync)(file, "utf8"));
}

// scripts/tdd/gates.ts
init_cjs_shims();
var import_fs6 = require("fs");
var import_path5 = require("path");
var GATES_SCHEMA_VERSION = 1;
var GATE_NAMES = ["spec", "plan", "test_list", "promote", "deploy"];
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
  if (!(0, import_fs6.existsSync)(file)) {
    return defaultGatesState(featureId);
  }
  const raw = (0, import_fs6.readFileSync)(file, "utf8");
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
  return (0, import_path5.join)(requireFeatureDir(tddDir, featureId), "gates.json");
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

// scripts/tdd/feature-status.ts
var MAX_RECENT_LOG_ENTRIES = 5;
function readJsonIfExists(path24) {
  if (!(0, import_fs7.existsSync)(path24)) return null;
  return JSON.parse((0, import_fs7.readFileSync)(path24, "utf8"));
}
function listFeatureStories(tddDir, featureId) {
  const storiesDir2 = storiesDir(tddDir, featureId);
  if (!(0, import_fs7.existsSync)(storiesDir2)) return [];
  return (0, import_fs7.readdirSync)(storiesDir2).filter((d) => (0, import_fs7.statSync)((0, import_path6.join)(storiesDir2, d)).isDirectory()).sort();
}
function timelineCycleCount(experimentDir2) {
  const timeline = readJsonIfExists(
    (0, import_path6.join)(experimentDir2, "timeline.json")
  );
  return timeline?.entries?.length ?? 0;
}
function summarizeTestList(tddDir, featureId) {
  try {
    const list = readMasterTestList(tddDir, featureId);
    const counters = {
      pending: 0,
      red: 0,
      green: 0,
      refactored: 0,
      skipped: 0
    };
    for (const item of list.items) counters[item.status]++;
    const total = list.items.length;
    const done = counters.green + counters.refactored;
    return {
      total,
      by_status: counters,
      completion_pct: total === 0 ? 0 : Math.round(done / total * 100)
    };
  } catch {
    return null;
  }
}
function readSelectionLogRecent(tddDir, limit) {
  const path24 = (0, import_path6.join)(tddDir, "selection-log.md");
  if (!(0, import_fs7.existsSync)(path24)) return [];
  const text = (0, import_fs7.readFileSync)(path24, "utf8");
  const entries = [];
  const headingRe = /^##\s+(\S+T\S+?)\s+–\s+(.+?)$/gm;
  let match;
  while ((match = headingRe.exec(text)) !== null) {
    entries.push({ timestamp: match[1], title: match[2].trim() });
  }
  return entries.slice(-limit);
}
function readGatesSummary(tddDir, featureId) {
  try {
    const state = readGates(featureId, { tddDir });
    const out = {};
    for (const name of GATE_NAMES) {
      const rec = state.gates[name];
      out[name] = {
        status: rec.status,
        approver: rec.approver ?? null,
        approved_at: rec.approved_at ?? null
      };
    }
    return out;
  } catch {
    return null;
  }
}
function readWorkflowState(tddDir) {
  const state = readJsonIfExists((0, import_path6.join)(tddDir, "workflow-state.json"));
  if (!state) return { phase: null, pointer: null };
  return {
    phase: state.phase ?? null,
    pointer: {
      feature_id: state.feature_id ?? null,
      story_id: state.story_id ?? null,
      ac_id: state.ac_id ?? null,
      cycle_id: state.cycle_id ?? null,
      experiment_id: state.experiment_id ?? null
    }
  };
}
function getFeatureStatus(tddDir, featureId) {
  const plans = [];
  for (const storyId of listFeatureStories(tddDir, featureId)) {
    const p = readPlan(tddDir, featureId, storyId);
    if (p) plans.push({ story_id: storyId, plan: p });
  }
  const experiments = [];
  for (const storyId of listExperimentStories(tddDir, featureId)) {
    for (const rec of listExperiments(tddDir, featureId, storyId)) {
      const outcomes = readOutcomes(tddDir, featureId, storyId, rec.experiment_slug);
      experiments.push({
        story_id: storyId,
        slug: rec.experiment_slug,
        branch_id: rec.branch_id,
        status: outcomes?.status ?? null,
        tests_passed: outcomes?.tests_passed ?? null,
        tests_failed: outcomes?.tests_failed ?? null,
        schema_diff_summary: outcomes?.schema_diff_summary ?? null,
        cycle_count: timelineCycleCount(rec.dir)
      });
    }
  }
  let smells = [];
  try {
    smells = readSmellsLog(tddDir).detected.filter((d) => !d.resolution);
  } catch {
    smells = [];
  }
  const { phase, pointer } = readWorkflowState(tddDir);
  return {
    feature_id: featureId,
    current_workflow_phase: phase,
    current_workflow_pointer: pointer,
    plans,
    test_list: summarizeTestList(tddDir, featureId),
    experiments,
    selection_log_recent: readSelectionLogRecent(tddDir, MAX_RECENT_LOG_ENTRIES),
    open_smells: smells,
    gates: readGatesSummary(tddDir, featureId)
  };
}

// scripts/github/pr.ts
init_cjs_shims();
var import_octokit4 = require("octokit");
var GitHubPullRequestError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "GitHubPullRequestError";
  }
  status;
};
async function octokit() {
  const token = await resolveGitHubToken();
  return new import_octokit4.Octokit({ auth: token });
}
function wrap4(err, context) {
  if (err instanceof import_octokit4.RequestError) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`);
  }
  throw new GitHubPullRequestError(context);
}
async function createPullRequest(args) {
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    let base = args.baseBranch;
    if (!base) {
      const { data: repoData } = await ok.rest.repos.get({ owner, repo });
      base = repoData.default_branch || "main";
    }
    const { data } = await ok.rest.pulls.create({
      owner,
      repo,
      title: args.title,
      head: args.headBranch,
      base,
      body: args.body
    });
    return data.html_url || "";
  } catch (err) {
    wrap4(err, "Failed to create pull request");
  }
}
async function getPullRequest(ownerRepo, headBranch) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data: pulls } = await ok.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${headBranch}`,
      per_page: 1
    });
    if (pulls.length === 0) return void 0;
    const { data: pr } = await ok.rest.pulls.get({
      owner,
      repo,
      pull_number: pulls[0].number
    });
    if (pr.state !== "open") return void 0;
    let checks = [];
    let ciStatus = "pending";
    const headSha = pr.head?.sha;
    if (headSha) {
      try {
        const { data: checksData } = await ok.rest.checks.listForRef({
          owner,
          repo,
          ref: headSha
        });
        const runs = checksData.check_runs || [];
        checks = runs.map((c) => ({
          name: c.name || "unknown",
          status: (c.status || "").toUpperCase(),
          conclusion: (c.conclusion || "").toUpperCase(),
          detailsUrl: c.details_url || void 0
        }));
        ciStatus = parseCiStatus(runs);
      } catch {
        ciStatus = "pending";
      }
    }
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url || "",
      state: (pr.state || "open").toUpperCase(),
      isDraft: pr.draft || false,
      ciStatus,
      checks,
      headBranch: pr.head?.ref || headBranch,
      baseBranch: pr.base?.ref || "",
      body: pr.body || void 0,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files
    };
  } catch {
    return void 0;
  }
}
function parseCiStatus(rawChecks) {
  if (rawChecks.length === 0) return "pending";
  const latestByName = /* @__PURE__ */ new Map();
  for (const c of rawChecks) {
    latestByName.set(c.name || "unknown", c);
  }
  const states = Array.from(latestByName.values()).map(
    (c) => (c.conclusion || c.status || "").toUpperCase()
  );
  if (states.some((s) => s === "FAILURE" || s === "ERROR" || s === "ACTION_REQUIRED")) {
    return "failure";
  }
  if (states.every((s) => s === "SUCCESS" || s === "NEUTRAL" || s === "SKIPPED")) {
    return "success";
  }
  return "pending";
}
async function getPullRequestReviews(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.listReviews({ owner, repo, pull_number: pullNumber });
    return data.map((r) => ({
      author: r.user?.login || "unknown",
      state: r.state || "COMMENTED",
      body: r.body || "",
      submittedAt: r.submitted_at || void 0
    }));
  } catch {
    return [];
  }
}
async function getPullRequestFiles(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber });
    const statusMap = {
      added: "added",
      removed: "deleted",
      modified: "modified",
      renamed: "renamed"
    };
    return data.map((f) => ({
      path: f.filename || "",
      status: statusMap[(f.status || "").toLowerCase()] || "modified",
      additions: f.additions || 0,
      deletions: f.deletions || 0
    }));
  } catch {
    return [];
  }
}
async function getPullRequestComments(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber
    });
    return data.map((c) => ({
      author: c.user?.login || "unknown",
      body: c.body || ""
    }));
  } catch {
    return [];
  }
}
async function mergePullRequest(args) {
  const method = args.method ?? "merge";
  const deleteRemoteBranch = args.deleteRemoteBranch !== false;
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.merge({
      owner,
      repo,
      pull_number: args.pullNumber,
      merge_method: method
    });
    if (deleteRemoteBranch) {
      try {
        const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
        const headRef = pr.data.head.ref;
        await ok.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${headRef}`
        });
      } catch {
      }
    }
    return data.message || `Merged PR #${args.pullNumber}`;
  } catch (err) {
    wrap4(err, "Failed to merge pull request");
  }
}
async function mergePairedPullRequest(args) {
  const warnings = [];
  const deleteLakebaseBranch = args.deleteLakebaseBranch !== false;
  let headBranch = "";
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
    headBranch = pr.data.head?.ref ?? "";
  } catch (err) {
    warnings.push(
      `Could not read PR head branch before merge: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const message = await mergePullRequest({
    ownerRepo: args.ownerRepo,
    pullNumber: args.pullNumber,
    method: args.method,
    deleteRemoteBranch: args.deleteRemoteBranch
  });
  let lakebaseBranchDeleted = false;
  if (deleteLakebaseBranch && headBranch) {
    const sanitized = sanitizeBranchName(headBranch);
    try {
      await deleteBranch({ instance: args.lakebaseInstance, branch: sanitized });
      lakebaseBranchDeleted = true;
    } catch (err) {
      warnings.push(
        `Lakebase branch "${sanitized}" cleanup failed (PR merge succeeded): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else if (deleteLakebaseBranch && !headBranch) {
    warnings.push("Skipped Lakebase branch cleanup \u2013 could not resolve PR head branch name");
  }
  return { message, headBranch, lakebaseBranchDeleted, warnings };
}

// scripts/lakebase/doctor.ts
init_cjs_shims();
var fs25 = __toESM(require("fs"), 1);
var path23 = __toESM(require("path"), 1);

// scripts/lakebase/databricks-host.ts
init_cjs_shims();
async function resolveDatabricksHost(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const out = await exec2(
    `databricks auth describe --profile "${escapeShellArg(args.profile)}" -o json`,
    { timeout: timeoutMs }
  );
  return parseHostFromAuthDescribe(out);
}
function parseHostFromAuthDescribe(out) {
  const start = out.indexOf("{");
  if (start < 0) return void 0;
  try {
    const parsed = JSON.parse(out.slice(start));
    const details = parsed.details;
    if (!details || typeof details !== "object") return void 0;
    const host = details.host;
    if (typeof host !== "string") return void 0;
    return host.replace(/\/+$/, "");
  } catch {
    return void 0;
  }
}
function escapeShellArg(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/workflow-drift.ts
init_cjs_shims();
var fs24 = __toESM(require("fs"), 1);
var path22 = __toESM(require("path"), 1);
function findKitTemplatesDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path22.join(
      dir,
      "templates",
      "project",
      "common",
      ".github",
      "workflows"
    );
    if (fs24.existsSync(candidate)) return candidate;
    const parent = path22.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.github/workflows/ relative to ${start}. Pass explicit kitDir.`
  );
}
function unifiedDiff(name, projectContent, templateContent) {
  if (projectContent === templateContent) return "";
  const a = projectContent.split("\n");
  const b = templateContent.split("\n");
  const out = [`--- project/${name}`, `+++ template/${name}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (av !== void 0) out.push(`-${i + 1}: ${av}`);
    if (bv !== void 0) out.push(`+${i + 1}: ${bv}`);
  }
  return out.join("\n");
}
function detectWorkflowDrift(args) {
  const projectWorkflowsDir = path22.join(
    args.projectDir,
    ".github",
    "workflows"
  );
  const here = path22.dirname(new URL(importMetaUrl).pathname);
  const kitWorkflowsDir = args.kitDir ? path22.join(
    args.kitDir,
    "templates",
    "project",
    "common",
    ".github",
    "workflows"
  ) : findKitTemplatesDir(here);
  const templateFiles = fs24.existsSync(kitWorkflowsDir) ? fs24.readdirSync(kitWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const projectFiles = fs24.existsSync(projectWorkflowsDir) ? fs24.readdirSync(projectWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const name of templateFiles) {
    seen.add(name);
    const projectPath2 = path22.join(projectWorkflowsDir, name);
    const templatePath = path22.join(kitWorkflowsDir, name);
    if (!fs24.existsSync(projectPath2)) {
      files.push({ name, status: "missing" });
      continue;
    }
    const projectContent = fs24.readFileSync(projectPath2, "utf8");
    const templateContent = fs24.readFileSync(templatePath, "utf8");
    if (projectContent === templateContent) {
      files.push({ name, status: "unchanged" });
    } else {
      files.push({
        name,
        status: "drifted",
        diff: unifiedDiff(name, projectContent, templateContent)
      });
    }
  }
  for (const name of projectFiles) {
    if (seen.has(name)) continue;
    files.push({ name, status: "extra" });
  }
  const order = {
    drifted: 0,
    missing: 1,
    extra: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const hasDrift = files.some((f) => f.status === "drifted" || f.status === "missing");
  return {
    overall: hasDrift ? "drift" : "ok",
    files
  };
}

// scripts/lakebase/doctor.ts
function readEnvFile(projectDir) {
  const envPath = path23.join(projectDir, ".env");
  if (!fs25.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs25.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}
async function checkDatabricksCli() {
  try {
    const out = await exec2("databricks --version", { timeout: 5e3 });
    const trimmed = out.trim();
    const m = trimmed.match(/v?(\d+)\.(\d+)/);
    if (m) {
      const major = parseInt(m[1], 10);
      if (major < 1) {
        return {
          name: "databricks-cli",
          status: "warn",
          message: `Databricks CLI ${trimmed} - kit expects v1.0+`,
          detail: { version: trimmed },
          hint: "Upgrade via Homebrew or the installer at https://docs.databricks.com/dev-tools/cli/install.html"
        };
      }
    }
    return {
      name: "databricks-cli",
      status: "ok",
      message: `Databricks CLI ${trimmed}`,
      detail: { version: trimmed }
    };
  } catch (err) {
    return {
      name: "databricks-cli",
      status: "fail",
      message: "databricks CLI not found on PATH",
      detail: { error: err.message },
      hint: "Install via Homebrew (`brew install databricks-cli`) or the official installer."
    };
  }
}
async function checkAuth(profile) {
  try {
    const profileArg = profile ? ` --profile ${profile}` : "";
    const out = await exec2(`databricks auth describe -o json${profileArg}`, {
      timeout: 5e3
    });
    let host;
    try {
      const parsed = JSON.parse(out);
      host = parsed?.details?.host ?? parsed?.host ?? parsed?.host_name;
    } catch {
    }
    return {
      name: "databricks-auth",
      status: "ok",
      message: host ? `Authenticated to ${host}` : "Authenticated (no host parsed from describe)",
      detail: { host, profile: profile ?? "default" }
    };
  } catch (err) {
    return {
      name: "databricks-auth",
      status: "fail",
      message: "databricks auth describe failed",
      detail: { error: err.message },
      hint: "Run `databricks auth login --host <your-workspace>` to authenticate."
    };
  }
}
async function checkIdentity(profile) {
  try {
    const profileArg = profile ? ` --profile ${profile}` : "";
    const out = await exec2(`databricks current-user me -o json${profileArg}`, {
      timeout: 5e3
    });
    let user;
    try {
      const parsed = JSON.parse(out);
      user = parsed?.userName ?? parsed?.emails?.[0]?.value;
    } catch {
    }
    return {
      name: "workspace-identity",
      status: "ok",
      message: user ? `Workspace reachable as ${user}` : "Workspace reachable",
      detail: { user }
    };
  } catch (err) {
    return {
      name: "workspace-identity",
      status: "fail",
      message: "Cannot resolve current user from workspace",
      detail: { error: err.message },
      hint: "Re-authenticate via `databricks auth login` and verify network connectivity."
    };
  }
}
function checkEnv(projectDir) {
  const env = readEnvFile(projectDir);
  const required = ["LAKEBASE_PROJECT_ID", "LAKEBASE_BRANCH_ID"];
  const missing = required.filter((k) => !env[k]);
  if (Object.keys(env).length === 0) {
    return {
      name: "env-file",
      status: "warn",
      message: ".env not found",
      detail: { projectDir, envPath: path23.join(projectDir, ".env") },
      hint: "Run `lakebase-get-connection --output dsn --write-env` or `lakebase-branch sync-env`."
    };
  }
  if (missing.length) {
    return {
      name: "env-file",
      status: "fail",
      message: `.env missing required vars: ${missing.join(", ")}`,
      detail: { presentKeys: Object.keys(env), missing },
      hint: "Re-run `lakebase-branch sync-env` to regenerate .env from the current branch."
    };
  }
  return {
    name: "env-file",
    status: "ok",
    message: `.env present with required keys (LAKEBASE_PROJECT_ID=${env.LAKEBASE_PROJECT_ID})`,
    detail: { keys: Object.keys(env).length, projectId: env.LAKEBASE_PROJECT_ID }
  };
}
async function checkConfigProfile(env) {
  const host = env.DATABRICKS_HOST;
  if (env.DATABRICKS_CONFIG_PROFILE) {
    return {
      name: "config-profile",
      status: "ok",
      message: `CLI profile pinned: ${env.DATABRICKS_CONFIG_PROFILE}`,
      detail: { profile: env.DATABRICKS_CONFIG_PROFILE }
    };
  }
  if (!host) {
    return {
      name: "config-profile",
      status: "skip",
      message: "Skipped: no DATABRICKS_HOST in .env"
    };
  }
  let resolved;
  try {
    resolved = await resolveProfileForHost(host);
  } catch {
  }
  if (!resolved) {
    return {
      name: "config-profile",
      status: "ok",
      message: "No profile pin needed (no unique CLI profile matches this host)",
      detail: { host }
    };
  }
  return {
    name: "config-profile",
    status: "warn",
    message: `.env has no DATABRICKS_CONFIG_PROFILE; host maps to valid profile "${resolved}"`,
    detail: { host, resolvedProfile: resolved },
    hint: `Run \`lakebase-doctor --fix\` (or add DATABRICKS_CONFIG_PROFILE=${resolved} to .env) so the hooks' auth preflight resolves the cached token.`
  };
}
async function checkLakebaseProject(projectId, host) {
  if (!projectId) {
    return {
      name: "lakebase-project",
      status: "skip",
      message: "Skipped: no LAKEBASE_PROJECT_ID in .env"
    };
  }
  try {
    const branches = await listBranches({ instance: projectId, host });
    return {
      name: "lakebase-project",
      status: "ok",
      message: `Project ${projectId} reachable (${branches.length} branches)`,
      detail: {
        projectId,
        branchCount: branches.length,
        branchNames: branches.map((b) => b.name)
      }
    };
  } catch (err) {
    return {
      name: "lakebase-project",
      status: "fail",
      message: `Cannot list branches on project ${projectId}`,
      detail: { error: err.message },
      hint: "Verify the project exists and your account has CAN_USE on it."
    };
  }
}
async function checkGitRemote(projectDir) {
  try {
    const url = (await exec2("git remote get-url origin", {
      cwd: projectDir,
      timeout: 5e3
    })).trim();
    if (!url) {
      return {
        name: "git-remote",
        status: "warn",
        message: "No origin remote configured"
      };
    }
    return {
      name: "git-remote",
      status: "ok",
      message: `origin -> ${url}`,
      detail: { url }
    };
  } catch (err) {
    return {
      name: "git-remote",
      status: "warn",
      message: "git remote get-url origin failed",
      detail: { error: err.message },
      hint: "Run `git remote add origin <url>` if this is a fresh repo."
    };
  }
}
function checkLanguage(projectDir) {
  try {
    const lang = detectLanguage(projectDir);
    return {
      name: "detected-language",
      status: "ok",
      message: `Project language: ${lang}`,
      detail: { language: lang }
    };
  } catch (err) {
    return {
      name: "detected-language",
      status: "warn",
      message: "Could not detect project language",
      detail: { error: err.message }
    };
  }
}
function checkHooks(projectDir) {
  const v = verifyHooks(projectDir);
  const installed = Object.entries(v).filter(([, ok]) => ok).map(([k]) => k);
  const missing = Object.entries(v).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length === 0) {
    return {
      name: "git-hooks",
      status: "ok",
      message: `All ${installed.length} project git hooks installed`,
      detail: v
    };
  }
  return {
    name: "git-hooks",
    status: "warn",
    message: `Missing git hooks: ${missing.join(", ")}`,
    detail: v,
    hint: "Re-run `lakebase-create-project --install-hooks` or copy the hook files from the kit's templates."
  };
}
function checkWorkflowDrift(projectDir) {
  try {
    const report = detectWorkflowDrift({ projectDir });
    const drifted = report.files.filter((f) => f.status === "drifted").length;
    const missing = report.files.filter((f) => f.status === "missing").length;
    if (report.overall === "ok") {
      return {
        name: "workflow-drift",
        status: "ok",
        message: "Scaffolded .github/workflows/*.yml match the kit's templates",
        detail: { files: report.files.map((f) => ({ name: f.name, status: f.status })) }
      };
    }
    return {
      name: "workflow-drift",
      status: "warn",
      message: `Scaffolded workflows drift from kit: ${drifted} drifted, ${missing} missing`,
      detail: { files: report.files.map((f) => ({ name: f.name, status: f.status })) },
      hint: "Inspect via the lakebase_workflow_drift MCP tool (or detectWorkflowDrift import). Refresh manually until updateWorkflows lands."
    };
  } catch (err) {
    return {
      name: "workflow-drift",
      status: "skip",
      message: "Could not run drift check",
      detail: { error: err.message }
    };
  }
}
function worstOf(statuses) {
  const order = ["ok", "skip", "warn", "fail"];
  return statuses.reduce(
    (acc, s) => order.indexOf(s) > order.indexOf(acc) ? s : acc,
    "ok"
  );
}
async function runDoctor(args = {}) {
  const projectDir = args.projectDir ?? process.cwd();
  const profile = args.profile ?? process.env.DATABRICKS_CONFIG_PROFILE;
  const cli = await checkDatabricksCli();
  const auth = cli.status === "ok" ? await checkAuth(profile) : {
    name: "databricks-auth",
    status: "skip",
    message: "Skipped: databricks CLI not available"
  };
  const identity = auth.status === "ok" ? await checkIdentity(profile) : {
    name: "workspace-identity",
    status: "skip",
    message: "Skipped: auth check failed"
  };
  let host = args.host;
  if (!host && auth.status === "ok") {
    try {
      host = await resolveDatabricksHost({ profile: profile ?? "DEFAULT" });
    } catch {
    }
  }
  const env = checkEnv(projectDir);
  const envVars = readEnvFile(projectDir);
  const configProfile = await checkConfigProfile(envVars);
  const lakebaseProject = await checkLakebaseProject(
    envVars.LAKEBASE_PROJECT_ID ?? "",
    host
  );
  const gitRemote = await checkGitRemote(projectDir);
  const language = checkLanguage(projectDir);
  const hooks = checkHooks(projectDir);
  const workflowDrift = checkWorkflowDrift(projectDir);
  const checks = [
    cli,
    auth,
    identity,
    env,
    configProfile,
    lakebaseProject,
    gitRemote,
    language,
    hooks,
    workflowDrift
  ];
  return {
    overall: worstOf(checks.map((c) => c.status)),
    checks
  };
}

// apps/mcp-server/tools.ts
function requireString(args, key) {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`'${key}' is required`);
  }
  return v;
}
function optionalString(args, key) {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
var TOOLS = [
  {
    name: "lakebase_get_connection",
    description: "Mint a Postgres DSN string for a Lakebase branch. Single-seam credential handoff: this is the only path that mints Lakebase credentials.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch id within the project." },
        endpointName: {
          type: "string",
          description: "Endpoint identifier on the branch. Default: 'primary'."
        },
        database: {
          type: "string",
          description: "Database name. Default: $PGDATABASE or 'databricks_postgres'."
        }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return await getConnection({
        output: "dsn",
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        endpointName: optionalString(args, "endpointName"),
        database: optionalString(args, "database")
      });
    }
  },
  {
    name: "lakebase_schema_diff",
    description: "Parent-aware schema diff between two Lakebase branches. If 'against' is omitted, parent is resolved from Lakebase metadata (sourceBranchId, falling back to the project's default branch).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Target branch to diff FOR." },
        against: {
          type: "string",
          description: "Explicit parent branch. Default: resolved from metadata."
        },
        database: {
          type: "string",
          description: "Database name. Default: $PGDATABASE or 'databricks_postgres'."
        }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return await getSchemaDiff({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        comparisonBranch: optionalString(args, "against"),
        database: optionalString(args, "database")
      });
    }
  },
  {
    name: "lakebase_github_token",
    description: "Resolve a GitHub token via the unified fallback chain (GITHUB_TOKEN env \u2192 VS Code session \u2192 gh auth token). Use 'diagnose: true' to inspect which sources are available WITHOUT revealing the token value.",
    inputSchema: {
      type: "object",
      properties: {
        diagnose: {
          type: "boolean",
          description: "If true, return { sources, primary, scopes } instead of the token itself. Safe to log."
        }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      if (args.diagnose === true) {
        return await diagnoseGitHubAuth();
      }
      const token = await resolveGitHubToken();
      const { primary } = await diagnoseGitHubAuth();
      return { token, source: primary };
    }
  },
  {
    name: "lakebase_create_project",
    description: "Bootstrap a fresh Lakebase-paired project end-to-end: Lakebase project + parent branch, GitHub repo (optional), Actions runner, repo secrets, local scaffold.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Project name (Lakebase id + local dir)." },
        parentDir: { type: "string", description: "Parent directory for the new project dir." },
        databricksHost: {
          type: "string",
          description: "Databricks workspace URL (https://....cloud.databricks.com)."
        },
        githubOwner: {
          type: "string",
          description: "GitHub user/org for the repo. Required unless createGithubRepo=false."
        },
        createGithubRepo: {
          type: "boolean",
          description: "Create a GitHub repo? Default: true."
        },
        privateRepo: {
          type: "boolean",
          description: "Make the GitHub repo private? Default: true."
        },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Project language. Default: 'java'."
        },
        runnerType: {
          type: "string",
          enum: ["self-hosted", "github-hosted"],
          description: "Actions runner mode. Default: 'self-hosted'."
        }
      },
      required: ["projectName", "parentDir", "databricksHost"],
      additionalProperties: false
    },
    handler: async (args) => {
      const input = {
        projectName: requireString(args, "projectName"),
        parentDir: requireString(args, "parentDir"),
        databricksHost: requireString(args, "databricksHost"),
        githubOwner: optionalString(args, "githubOwner"),
        createGithubRepo: typeof args.createGithubRepo === "boolean" ? args.createGithubRepo : void 0,
        privateRepo: typeof args.privateRepo === "boolean" ? args.privateRepo : void 0,
        language: optionalString(args, "language"),
        runnerType: optionalString(args, "runnerType")
      };
      return await createProject(input);
    }
  },
  {
    name: "lakebase_list_migrations",
    description: "Enumerate migration files on disk for a paired project. No DB connection. Auto-detects language (java/kotlin via pom.xml + Flyway, python via pyproject.toml/alembic.ini + Alembic, nodejs via package.json + Knex).",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project root. Default: cwd of the MCP server." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return listSchemaMigrations({
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language")
      });
    }
  },
  {
    name: "lakebase_apply_migrations",
    description: "Apply pending forward migrations against a Lakebase branch. Supports Python/Alembic, Java+Kotlin/Flyway, and Node/Knex. Auto-detects the language from project markers (alembic.ini, pom.xml, knexfile.{js,ts}).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to migrate against." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return applySchemaMigrations({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language"),
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName")
      });
    }
  },
  {
    name: "lakebase_rollback_migration",
    description: "Roll back applied migrations on a Lakebase branch down to a target version. Supported for Python/Alembic + Node/Knex; NOT supported for Java+Kotlin/Flyway (Flyway Community Edition has no `undo`). For Alembic, 'target' can be a revision id or a relative step like '-1'. For Knex, use 'all' or '0' for full rollback; other values roll back the last batch.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to roll back." },
        target: { type: "string", description: "Revision id or relative step (e.g., '-1' for one step down)." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." }
      },
      required: ["instance", "branch", "target"],
      additionalProperties: false
    },
    handler: async (args) => {
      return rollbackSchemaMigration({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        target: requireString(args, "target"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language"),
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName")
      });
    }
  },
  {
    name: "lakebase_migration_status",
    description: "Report the currently-applied migration version and the list of pending migrations for a Lakebase branch.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to inspect." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return schemaMigrationStatus({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language"),
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName")
      });
    }
  },
  {
    name: "lakebase_feature_status",
    description: "One-screen snapshot of a feature's TDD workflow state (phase, plan, test-list completion, experiments, recent decisions, open smells). Reads .tdd/ on disk; no Lakebase or network calls. See skills/lakebase-tdd-workflows/references/feature-status-schema.md for the stable payload contract.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature id (e.g., 'F1-checkout')." },
        tddDir: { type: "string", description: "Path to the .tdd/ directory. Default: './.tdd'." }
      },
      required: ["featureId"],
      additionalProperties: false
    },
    handler: async (args) => {
      return getFeatureStatus(
        optionalString(args, "tddDir") ?? "./.tdd",
        requireString(args, "featureId")
      );
    }
  },
  // ------------------------- PR tools -------------------------
  {
    name: "lakebase_pr_open",
    description: "Create a GitHub pull request via the REST API. Returns the PR html_url.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        headBranch: { type: "string", description: "Head branch with the changes." },
        title: { type: "string", description: "PR title." },
        body: { type: "string", description: "PR body (markdown)." },
        baseBranch: { type: "string", description: "Target base branch. Default: repo default." }
      },
      required: ["ownerRepo", "headBranch", "title", "body"],
      additionalProperties: false
    },
    handler: async (args) => {
      const url = await createPullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        headBranch: requireString(args, "headBranch"),
        title: requireString(args, "title"),
        body: requireString(args, "body"),
        baseBranch: optionalString(args, "baseBranch")
      });
      return { url };
    }
  },
  {
    name: "lakebase_pr_merge",
    description: "Merge a GitHub pull request. Default deletes the remote head branch on merge.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number to merge." },
        method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method. Default: merge." },
        deleteRemoteBranch: { type: "boolean", description: "Delete remote head after merge. Default: true." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      const message = await mergePullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        pullNumber: num,
        method: optionalString(args, "method"),
        deleteRemoteBranch: typeof args.deleteRemoteBranch === "boolean" ? args.deleteRemoteBranch : void 0
      });
      return { message };
    }
  },
  {
    name: "lakebase_pr_merge_paired",
    description: "Merge a GitHub PR AND delete the matching feature branch in the Lakebase project. Single-call workflow cleanup.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number to merge." },
        lakebaseInstance: { type: "string", description: "Lakebase project id used to clean up the feature branch." },
        method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method. Default: merge." },
        deleteRemoteBranch: { type: "boolean", description: "Delete remote head after merge. Default: true." },
        deleteLakebaseBranch: { type: "boolean", description: "Delete the Lakebase feature branch. Default: true." }
      },
      required: ["ownerRepo", "pullNumber", "lakebaseInstance"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return mergePairedPullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        pullNumber: num,
        lakebaseInstance: requireString(args, "lakebaseInstance"),
        method: optionalString(args, "method"),
        deleteRemoteBranch: typeof args.deleteRemoteBranch === "boolean" ? args.deleteRemoteBranch : void 0,
        deleteLakebaseBranch: typeof args.deleteLakebaseBranch === "boolean" ? args.deleteLakebaseBranch : void 0
      });
    }
  },
  {
    name: "lakebase_pr_status",
    description: "Look up an OPEN pull request by head branch. Returns state, CI checks, counts, review decision. Returns undefined if no open PR exists for that head.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        headBranch: { type: "string", description: "Head branch to look up." }
      },
      required: ["ownerRepo", "headBranch"],
      additionalProperties: false
    },
    handler: async (args) => {
      const info = await getPullRequest(
        requireString(args, "ownerRepo"),
        requireString(args, "headBranch")
      );
      return info ?? null;
    }
  },
  {
    name: "lakebase_pr_files",
    description: "List files changed by a pull request, with status (added / modified / removed / renamed) and per-file diff stats.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestFiles(requireString(args, "ownerRepo"), num);
    }
  },
  {
    name: "lakebase_pr_reviews",
    description: "List reviews on a pull request (APPROVED / CHANGES_REQUESTED / COMMENTED / etc.).",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestReviews(requireString(args, "ownerRepo"), num);
    }
  },
  {
    name: "lakebase_pr_comments",
    description: "List top-level issue comments on a pull request (separate from review-thread comments).",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestComments(requireString(args, "ownerRepo"), num);
    }
  },
  // ------------------------- doctor -------------------------
  {
    name: "lakebase_doctor",
    description: "Run health checks on a Lakebase project: CLI version + auth, .env shape, project reachability, git remote, language, git hooks. Returns a structured report with per-check status + remediation hints.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project directory to inspect. Default: server cwd." },
        profile: { type: "string", description: "Databricks CLI profile. Default: $DATABRICKS_CONFIG_PROFILE." },
        host: { type: "string", description: "Workspace host override." }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return runDoctor({
        projectDir: optionalString(args, "projectDir"),
        profile: optionalString(args, "profile"),
        host: optionalString(args, "host")
      });
    }
  },
  // ------------------------- workflow drift ----------------------
  {
    name: "lakebase_workflow_drift",
    description: "Detect drift between a scaffolded project's .github/workflows/*.yml and the kit's current templates. Returns per-file status (unchanged / drifted / missing / extra) and a unified diff for drifted files. Use when a maintainer wants to know if a project's CI templates are stale vs the kit it pins.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project directory containing .github/workflows/." },
        kitDir: { type: "string", description: "Override the kit directory (default: bundled templates path)." }
      },
      required: ["projectDir"],
      additionalProperties: false
    },
    handler: async (args) => {
      return detectWorkflowDrift({
        projectDir: requireString(args, "projectDir"),
        kitDir: optionalString(args, "kitDir")
      });
    }
  },
  // ------------------------- branch read tools -------------
  {
    name: "lakebase_branch_list",
    description: "List branches on a Lakebase project (name, uid, parent, expiration, state).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["instance"],
      additionalProperties: false
    },
    handler: async (args) => {
      return listBranches({
        instance: requireString(args, "instance"),
        host: optionalString(args, "host")
      });
    }
  },
  {
    name: "lakebase_branch_show",
    description: "Look up a single Lakebase branch by name or uid. Returns undefined if not found.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name or uid." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      const info = await getBranchByName(requireString(args, "branch"), {
        instance: requireString(args, "instance"),
        host: optionalString(args, "host")
      });
      return info ?? null;
    }
  },
  // NOTE: the unpaired `lakebase_branch_create` tool was DELETED. It exposed a
  // Lakebase-only create (no git branch, no .env) to agents. Every branch is
  // paired through the substrate; use lakebase_branch_create_paired below.
  {
    name: "lakebase_branch_create_paired",
    description: "Create a Lakebase branch + matching local git branch + .env update in one call. The canonical 'fork from current' workflow op (mirrors the post-checkout git hook).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name (used for both Lakebase and git)." },
        parentBranch: { type: "string", description: "Lakebase parent branch override." },
        cwd: { type: "string", description: "Project directory (must contain .git/). Default: server cwd." },
        createGitBranch: { type: "boolean", description: "Create + switch the local git branch. Default: true." },
        syncEnv: { type: "boolean", description: "Rewrite .env to point at the new endpoint. Default: true." },
        database: { type: "string", description: "Postgres database name. Default: 'databricks_postgres'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return createPairedBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        parentBranch: optionalString(args, "parentBranch"),
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        createGitBranch: typeof args.createGitBranch === "boolean" ? args.createGitBranch : void 0,
        syncEnv: typeof args.syncEnv === "boolean" ? args.syncEnv : void 0,
        database: optionalString(args, "database")
      });
    }
  },
  // NOTE: the unpaired `lakebase_branch_create_tier` tool was DELETED. It made a
  // Lakebase branch with no git branch + no .env sync. Use the paired tier-create
  // tool above: every branch is paired through the substrate.
  // NOTE: the unpaired `lakebase_branch_delete` tool was DELETED. Use
  // lakebase_branch_delete_paired so the git branch is cleaned up alongside the
  // Lakebase branch.
  {
    name: "lakebase_branch_delete_paired",
    description: "Delete a Lakebase branch + local git branch + remote git branch in one call. Skips deletion of branches that are currently checked out (local) or absent (remote). Default deletes everything; pass deleteGitLocal/deleteGitRemote: false to skip a side.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name." },
        cwd: { type: "string", description: "Project directory (must contain .git/). Default: server cwd." },
        deleteGitLocal: { type: "boolean", description: "Delete the local git branch. Default: true." },
        deleteGitRemote: { type: "boolean", description: "Delete the remote git branch. Default: true." },
        gitRemote: { type: "string", description: "Git remote name. Default: 'origin'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return deletePairedBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        deleteGitLocal: typeof args.deleteGitLocal === "boolean" ? args.deleteGitLocal : void 0,
        deleteGitRemote: typeof args.deleteGitRemote === "boolean" ? args.deleteGitRemote : void 0,
        gitRemote: optionalString(args, "gitRemote")
      });
    }
  },
  {
    name: "lakebase_branch_checkout_paired",
    description: "In-process equivalent of the post-checkout git hook: sync .env to the current git branch's matching Lakebase endpoint. Use after switching git branches outside the hook flow.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory (must contain .env). Default: server cwd." },
        branch: { type: "string", description: "Target git branch override. Default: read current via git." },
        instance: { type: "string", description: "Lakebase instance override. Default: read LAKEBASE_PROJECT_ID from .env." },
        trunkAlias: { type: "string", description: "Git branch name that should pair with the project's default Lakebase branch. Mirrors LAKEBASE_TRUNK_BRANCH from the post-checkout hook." }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return checkoutPaired({
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        branch: optionalString(args, "branch"),
        instance: optionalString(args, "instance"),
        trunkAlias: optionalString(args, "trunkAlias")
      });
    }
  },
  {
    name: "lakebase_branch_sync_env",
    description: "Refresh .env to point at the current branch's endpoint. Recovery for .env drift; equivalent of the post-checkout hook minus the git-branch step.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory (must contain .env and .git/). Default: server cwd." },
        instance: { type: "string", description: "Lakebase instance override. Default: read LAKEBASE_PROJECT_ID from .env." },
        branch: { type: "string", description: "Branch name override. Default: current git branch (sanitized)." },
        database: { type: "string", description: "Postgres database name. Default: 'databricks_postgres'." }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return syncEnvToCurrentBranch({
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        instance: optionalString(args, "instance"),
        branch: optionalString(args, "branch"),
        database: optionalString(args, "database")
      });
    }
  }
];
function findTool(name) {
  return TOOLS.find((t) => t.name === name);
}

// apps/mcp-server/index.ts
async function createServer() {
  const server = new import_server.Server(
    {
      name: "lakebase-app-dev-kit",
      version: "0.2.0-alpha.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  server.setRequestHandler(import_types.ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }));
  server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
    const tool = findTool(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
      };
    }
    try {
      const result = await tool.handler(request.params.arguments ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: err instanceof Error ? err.message : String(err) }
        ]
      };
    }
  });
  return server;
}
async function main() {
  const server = await createServer();
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `lakebase-app-dev-kit MCP server ready (${TOOLS.length} tools)
`
  );
}
var isCli = importMetaUrl === `file://${process.argv[1]}`;
if (isCli) {
  main().catch((err) => {
    process.stderr.write(
      `MCP server failed: ${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createServer
});
//# sourceMappingURL=index.cjs.map