let toString = Object.prototype.toString
//======================================================================

// 插件模式
let pluginArr = []
function doFunOn(fn) {
    pluginArr.push(fn)
}
function doFun(fn, isComponent) {
    // 一些临时字段，unload会自动清理
    let temp = {}
    let vm

    function $vm(key) {
        if (key) {
            return vm[key]
        }
        return vm
    }

    let options = {}

    let data = (options.data = {})
    function setData(key, callback, ex) {
        let dd = key
        if (typeof key == "string") {
            dd = {}
            dd[key] = callback
            callback = ex
        }

        if (vm) {
            vm.setData(dd, callback)
            return
        }

        for (let n in dd) {
            let da = data
            n.replace(/(\w+)(\]\.?|\.|\[)?/g, function(s0, s1, s2) {
                if (!s2) {
                    da[s1] = dd[n]
                    return ""
                }
                if (s2 != "[") {
                    s2 = "."
                }
                let daTo = da[s1]
                let daType = toString.call(daTo).toLowerCase() == "[object array]" ? "[" : "."
                if (daType != s2) {
                    da[s1] = daType == "[" ? [] : {}
                }
                return ""
            })
        }
    }

    function getData(key) {
        let da = vm ? vm.data : data
        let arr = key.match(/\w+/g) || []
        for (let i = 0; i < arr.length; i += 1) {
            da = da[arr[i]]
            if (da == null) {
                break
            }
        }

        return da
    }

    let methods = {}
    function methodsHandle(fn) {
        return function() {
            fn.apply(vm, arguments)
        }
    }
    function setMethods(key, fn) {
        if (typeof key == "function") {
            return methodsHandle(key)
        }
        if (vm) {
            return
        }

        if (typeof key == "string") {
            methods[key] = fn
            return methodsHandle(fn)
        }

        let val = {}
        for (let n in key) {
            methods[n] = key[n]
            val[n] = methodsHandle(key[n])
        }
        return val
    }

    function setter(key) {
        return function(k, v) {
            let opt = vm || options
            if (v === undefined) {
                opt[key] = k
                return
            }

            let toOpt = opt[key]
            if (!toOpt) {
                toOpt = opt[key] = {}
            }

            if (typeof k == "string") {
                toOpt[k] = v
                return
            }
            Object.assign(toOpt, k)
        }
    }

    function lifecycleExec(fns) {
        return function() {
            for (let i = 0; i < fns.length; i += 1) {
                fns[i].apply(this, arguments)
            }
        }
    }
    function makeLifecycle() {
        let lifecycles = {}

        return {
            on(key, fn) {
                if (typeof key == "string") {
                    let lc = lifecycles[key]
                    if (!lc) {
                        lc = lifecycles[key] = []
                    }
                    lc.push(fn)
                    return
                }
                for (let n in key) {
                    lifecycle(n, key[n])
                }
            },
            make(opt = {}) {
                for (let n in lifecycles) {
                    opt[n] = lifecycleExec(lifecycles[n])
                }
                return opt
            },
            emit(type, ...args) {
                let fns = lifecycles[type] || []
                for (let i = 0; i < fns.length; i += 1) {
                    fns[i].apply(vm, args)
                }
            },
            currying(key) {
                return fn => this.on(key, fn)
            },
            has() {
                for (let n in lifecycles) {
                    return true
                }
                return false
            }
        }
    }

    // ============================================

    // let unicom = makeLifecycle()
    let lifecycle = makeLifecycle()

    let fnArg = {
        // 参数
        options,
        temp,

        // 参数
        $vm,
        $setData: setData,
        $getData: getData,
        $methods: setMethods
    }
    // clearTimeout
    // clearInterval

    function detached() {
        vm = null
        // 自动清理临时字段中数据
        for (let n in temp) {
            if (n.indexOf("$handleT$") == 0) {
                clearTimeout(temp[n])
            }
            if (n.indexOf("$handleI$") == 0) {
                clearInterval(temp[n])
            }
            temp[n] = undefined
            delete temp[n]
        }
    }

    if (isComponent) {
        // 组件特有
        fnArg.$properties = setter("properties")
        fnArg.$attached = lifecycle.currying("attached")
        fnArg.$ready = lifecycle.currying("ready")
        fnArg.$detached = lifecycle.currying("detached")

        lifecycle.on("attached", function() {
            vm = this
        })
        lifecycle.on("detached", detached)
    } else {
        fnArg.$attached = fnArg.$onLoad = lifecycle.currying("onLoad")
        fnArg.$onShow = lifecycle.currying("onShow")
        fnArg.$onReady = lifecycle.currying("onReady")
        fnArg.$onHide = lifecycle.currying("onHide")
        fnArg.$detached = fnArg.$onUnload = lifecycle.currying("onUnload")
        fnArg.$onPageScroll = lifecycle.currying("onPageScroll")

        lifecycle.on("onLoad", function(query) {
            temp.query = query
            vm = this
        })
        lifecycle.on("onUnload", detached)
    }

    let afterArr = []

    pluginArr.forEach(function(pluginFn) {
        pluginFn({
            after: function(afterFn) {
                afterArr.push(afterFn)
            },
            attached(fn) {
                lifecycle.on((isComponent && "attached") || "onLoad", fn)
            },
            detached(fn) {
                lifecycle.on((isComponent && "detached") || "onUnload", fn)
            },
            fnArg,
            lifecycle,
            makeLifecycle,
            setter,
            isComponent
        })
    })

    fn(fnArg)

    afterArr.forEach(function(afterFn) {
        afterFn(fnArg)
    })

    lifecycle.make(options)

    if (isComponent) {
        options.methods = methods
        Component(options)
    } else {
        Object.assign(options, methods)
        Page(options)
    }

    return options
}

doFun.on = doFunOn
doFun.default = doFun

module.exports = doFun
