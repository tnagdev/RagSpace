



def singleton(cls):
    instances = {}
    
    class SingletonWrapper(cls):
        def __new__(cls_inner, *args, **kwargs):
            if cls_inner not in instances:
                instance = super(SingletonWrapper, cls_inner).__new__(cls_inner)
                instances[cls_inner] = instance
                instance.__init__(*args, **kwargs)
            return instances[cls_inner]
        
        def __init__(self, *args, **kwargs):
            if not hasattr(self, '_initialized'):
                super().__init__(*args, **kwargs)
                self._initialized = True
    
    SingletonWrapper.__name__ = cls.__name__
    SingletonWrapper.__qualname__ = cls.__qualname__
    return SingletonWrapper
