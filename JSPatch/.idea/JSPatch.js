/**
 * Created by fanzhiyuan on 2017/8/6.
 */
var global = this

;(function() {

    var _ocCls = {};
    var _jsCls = {};

    //用对象的转换
    var _formatOCToJS = function(obj) {//将oc对象转格式化为JS对象
        if (obj === undefined || obj === null) return false
        if (typeof obj == "object") {
            if (obj.__obj) return obj
            if (obj.__isNil) return false//空类/空对象,返回false
        }
        if (obj instanceof Array) {
            var ret = []
            obj.forEach(function(o) {
                ret.push(_formatOCToJS(o))
            })
            return ret
        }
        if (obj instanceof Function) {
            return function() {
                var args = Array.prototype.slice.call(arguments)
                var formatedArgs = _OC_formatJSToOC(args)
                for (var i = 0; i < args.length; i++) {
                    if (args[i] === null || args[i] === undefined || args[i] === false) {
                        formatedArgs.splice(i, 1, undefined)
                    } else if (args[i] == nsnull) {
                        formatedArgs.splice(i, 1, null)
                    }
                }
                return _OC_formatOCToJS(obj.apply(obj, formatedArgs))
            }
        }
        if (obj instanceof Object) {
            var ret = {}
            for (var key in obj) {
                ret[key] = _formatOCToJS(obj[key])
            }
            return ret
        }
        return obj
    }
    // JS与oc方法的转换
    var _methodFunc = function(instance, clsName, methodName, args, isSuper, isPerformSelector) {
        var selectorName = methodName
        if (!isPerformSelector) {
            methodName = methodName.replace(/__/g, "-")
            selectorName = methodName.replace(/_/g, ":").replace(/-/g, "_")
            // match() 方法可在字符串内检索指定的值，或找到一个或多个正则表达式的匹配。
            var marchArr = selectorName.match(/:/g)
            var numOfArgs = marchArr ? marchArr.length : 0
            if (args.length > numOfArgs) {
                selectorName += ":"
            }
        }
        var ret = instance ? _OC_callI(instance, selectorName, args, isSuper):
            _OC_callC(clsName, selectorName, args)
        return _formatOCToJS(ret)
    }

/** 方法转换的具体实现
 * 通过给js添加__c成员,利用正则吧所有函数调用改为 '__c + 方法名'
 * (例:UIView.alloc().init()->UIView.__c('alloc')().__c('init')())的形式
     这样做不用去 OC 遍历对象方法，不用在 JS 对象保存这些方法，内存消耗直降 99%
    */
    var _customMethods = {
        __c: function(methodName) {
            var slf = this

            if (slf instanceof Boolean)//判断slf指针是否为空??
            //typeof 是一个一元运算，放在一个运算数之前，运算数可以是任意类型。
            // instanceof 用于判断一个变量是否某个对象的实例
            {
                return function() {
                    return false
                }
            }
            if (slf[methodName]) {
                return slf[methodName].bind(slf);//bind() 方法为被选元素添加一个或多个事件处理程序，并规定事件发生时运行的函数。
            }

            if (!slf.__obj && !slf.__clsName) {
                throw new Error(slf + '.' + methodName + ' is undefined')//如果类名和方法名为空抛出'未定义错误'
            }
            if (slf.__isSuper && slf.__clsName) {
                slf.__clsName = _OC_superClsName(slf.__obj.__realClsName ? slf.__obj.__realClsName: slf.__clsName);
            }
            var clsName = slf.__clsName
            if (clsName && _ocCls[clsName])//如果类名存在且为oc方法名数组中的一员
            {
                var methodType = slf.__obj ? 'instMethods': 'clsMethods'
                if (_ocCls[clsName][methodType][methodName]) {
                    slf.__isSuper = 0;
                    return _ocCls[clsName][methodType][methodName].bind(slf)
                }
            }

            return function(){
                var args = Array.prototype.slice.call(arguments)
                return _methodFunc(slf.__obj, slf.__clsName, methodName, args, slf.__isSuper)
            }
        },

        super: function() {
            var slf = this
            if (slf.__obj) {
                slf.__obj.__realClsName = slf.__realClsName;
            }
            return {__obj: slf.__obj, __clsName: slf.__clsName, __isSuper: 1}
        },

        performSelectorInOC: function() {
            var slf = this
            var args = Array.prototype.slice.call(arguments)
            return {__isPerformInOC:1, obj:slf.__obj, clsName:slf.__clsName, sel: args[0], args: args[1], cb: args[2]}
        },
        // 将方法返回给oc 在oc中实现performSelect方法的调用
        performSelector: function() {
            var slf = this
            var args = Array.prototype.slice.call(arguments)
            return _methodFunc(slf.__obj, slf.__clsName, args[0], args.splice(1), slf.__isSuper, true)
        }
    }

/** Object.defineProperty,(属性拦截器)，vue.js是通过它实现双向绑定的。俗称属性拦截器.
    方法会直接在一个对象上定义一个新属性，或者修改一个已经存在的属性， 并返回这个对象。
    也就相当去oc中的runtime中属性关联的方法类似于利用runtime实现的字典转模型
    参数
    obj--------需要定义属性的对象。

    prop-------需定义或修改的属性的名字。

    descriptor-将被定义或修改的属性的描述符。

    configurable当且仅当值为true时,函数属性描述符才能够被改变,默认为false

    enumerable- 当且仅当该属性的 enumerable 为 true 时，该属性才能够出现在对象的枚举属性中

    返回值  返回传入函数的对象，即第一个参数obj*/
    for (var method in _customMethods) {
        if (_customMethods.hasOwnProperty(method)) {
            Object.defineProperty(Object.prototype, method, {value: _customMethods[method], configurable:false, enumerable: false})
        }
    }
    //_require 作用为:
    // 如果类名为nil是给__clsName赋值,
    var _require = function(clsName) {
        if (!global[clsName]) {
            global[clsName] = {
                __clsName: clsName
            }
        }
        return global[clsName]
    }

    global.require = function() {
        var lastRequire
        for (var i = 0; i < arguments.length; i ++) {
            arguments[i].split(',').forEach(function(clsName) {
                lastRequire = _require(clsName.trim())
            })
        }
        return lastRequire
    }

    //方法和方法名的序列化 转换成能够OC对象能够调用的接口
    var _formatDefineMethods = function(methods, newMethods, realClsName) {
        for (var methodName in methods) {
            if (!(methods[methodName] instanceof Function)) return;
            (function()
            {
                var originMethod = methods[methodName]
                newMethods[methodName] =
                    [originMethod.length, function() {
                    try
                    {
                        /** JS函数说明
                         *   slice() 方法可从已有的数组中返回选定的元素
                         call方法:
                         语法：call([thisObj[,arg1[, arg2[,   [,.argN]]]]])
                         定义：调用一个对象的一个方法，以另一个对象替换当前对象。
                         call 方法可将一个函数的对象上下文从初始的上下文改变为由 thisObj 指定的新对象。
                         apply方法：
                         语法：apply([thisObj[,argArray]])
                         定义：应用某一对象的一个方法，用另一个对象替换当前对象*/

                        var args = _formatOCToJS(Array.prototype.slice.call(arguments))
                        var lastSelf = global.self
                        global.self = args[0]
                        if (global.self) global.self.__realClsName = realClsName
                        args.splice(0,1)
                        var ret = originMethod.apply(originMethod, args)//类似于class_replaceMethod
                        global.self = lastSelf
                        return ret
                    } catch(e)
                    {
                        _OC_catch(e.message, e.stack)
                    }
                }]
            })()
        }
    }

    //js交换方法实现
    var _wrapLocalMethod = function(methodName, func, realClsName) {
        return function() {
            var lastSelf = global.self
            global.self = this
            this.__realClsName = realClsName
            var ret = func.apply(this, arguments)
            global.self = lastSelf
            return ret
        }
    }

    var _setupJSMethod = function(className, methods, isInst, realClsName) {
        for (var name in methods) {
            var key = isInst ? 'instMethods': 'clsMethods',
                func = methods[name]
            _ocCls[className][key][name] = _wrapLocalMethod(name, func, realClsName)
        }
    }

    var _propertiesGetFun = function(name){
        return function(){
            var slf = this;
            if (!slf.__ocProps) {
                var props = _OC_getCustomProps(slf.__obj)
                if (!props) {
                    props = {}
                    _OC_setCustomProps(slf.__obj, props)
                }
                slf.__ocProps = props;
            }
            return slf.__ocProps[name];
        };
    }

    var _propertiesSetFun = function(name){
        return function(jval){
            var slf = this;
            if (!slf.__ocProps) {
                var props = _OC_getCustomProps(slf.__obj)
                if (!props) {
                    props = {}
                    _OC_setCustomProps(slf.__obj, props)
                }
                slf.__ocProps = props;
            }
            slf.__ocProps[name] = jval;
        };
    }

    //将实例方法和类方法定义成对象,使js能够用点语法调用,属性的getter个setter方法的实现
    /*返回值是一个对象_ocCls,JS会把他的methods全部添加到__ocCls对象中*/
    global.defineClass = function(declaration, properties, instMethods, clsMethods) {
        var newInstMethods = {}, newClsMethods = {}
        if (!(properties instanceof Array)) {
            clsMethods = instMethods
            instMethods = properties
            properties = null
        }

        if (properties) {
            properties.forEach(function(name){
                if (!instMethods[name]) {
                    instMethods[name] = _propertiesGetFun(name);
                }
                var nameOfSet = "set"+ name.substr(0,1).toUpperCase() + name.substr(1);//set方法的命名
                if (!instMethods[nameOfSet]) {
                    instMethods[nameOfSet] = _propertiesSetFun(name);
                }
            });
        }

        var realClsName = declaration.split(':')[0].trim()
        // 吧OC的类存在ocCls对象里面
        _formatDefineMethods(instMethods, newInstMethods, realClsName)
        _formatDefineMethods(clsMethods, newClsMethods, realClsName)
        var ret = _OC_defineClass(declaration, newInstMethods, newClsMethods)
        var className = ret['cls']
        var superCls = ret['superCls']

        _ocCls[className] = {
            instMethods: {},
            clsMethods: {},
        }

        if (superCls.length && _ocCls[superCls]) {
            for (var funcName in _ocCls[superCls]['instMethods']) {
                _ocCls[className]['instMethods'][funcName] = _ocCls[superCls]['instMethods'][funcName]
            }
            for (var funcName in _ocCls[superCls]['clsMethods']) {
                _ocCls[className]['clsMethods'][funcName] = _ocCls[superCls]['clsMethods'][funcName]
            }
        }

        _setupJSMethod(className, instMethods, 1, realClsName)
        _setupJSMethod(className, clsMethods, 0, realClsName)

        return require(className)
    }
    //协议方法的实现
    global.defineProtocol = function(declaration, instProtos , clsProtos) {
        var ret = _OC_defineProtocol(declaration, instProtos,clsProtos);
        return ret
    }
    // block的实现
    global.block = function(args, cb) {
        var that = this
        var slf = global.self
        if (args instanceof Function) {
            cb = args
            args = ''
        }
        var callback = function() {
            var args = Array.prototype.slice.call(arguments)
            global.self = slf
            return cb.apply(that, _formatOCToJS(args))
        }
        var ret = {args: args, cb: callback, argCount: cb.length, __isBlock: 1}
        if (global.__genBlock) {
            ret['blockObj'] = global.__genBlock(args, cb)
        }
        return ret
    }

    if (global.console) {
        var jsLogger = console.log;
        global.console.log = function() {
            global._OC_log.apply(global, arguments);
            if (jsLogger) {
                jsLogger.apply(global.console, arguments);
            }
        }
    } else {
        global.console = {
            log: global._OC_log
        }
    }

    global.defineJSClass = function(declaration, instMethods, clsMethods) {
        var o = function() {},
            a = declaration.split(':'),
            clsName = a[0].trim(),//  trim()是 js中一个处理字符串的函数
            superClsName = a[1] ? a[1].trim() : null
        o.prototype = {
            init: function() {
                if (this.super()) this.super().init()
                return this;
            },
            super: function() {
                return superClsName ? _jsCls[superClsName].prototype : null
            }
        }
        var cls = {
            alloc: function() {
                return new o;
            }
        }
        for (var methodName in instMethods) {
            o.prototype[methodName] = instMethods[methodName];
        }
        for (var methodName in clsMethods) {
            cls[methodName] = clsMethods[methodName];
        }
        global[clsName] = cls
        _jsCls[clsName] = o
    }

    global.YES = 1
    global.NO = 0
    global.nsnull = _OC_null
    global._formatOCToJS = _formatOCToJS

})()
