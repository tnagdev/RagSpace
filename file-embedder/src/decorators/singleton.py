"""
Singleton decorator for ensuring single instance of a class.
Properly handles inheritance hierarchies including diamond inheritance patterns.
"""

# Global registry for singleton instances - keyed by ORIGINAL class name
_singleton_instances = {}


def singleton(cls):
    """
    Singleton decorator that properly handles inheritance and diamond patterns.
    
    Key features:
    1. Returns the same instance for each decorated class
    2. Tracks which base classes have been initialized to prevent duplicate init
    3. Works with multiple inheritance (diamond pattern)
    """
    original_name = cls.__name__
    
    class SingletonWrapper(cls):
        _singleton_original_name = original_name
        
        def __new__(cls_inner, *args, **kwargs):
            # Use the leaf class name (the actual class being instantiated)
            class_name = getattr(cls_inner, '_singleton_original_name', cls_inner.__name__)
            
            if class_name not in _singleton_instances:
                instance = object.__new__(cls_inner)
                # Track which classes in the hierarchy have been initialized
                instance._initialized_classes = set()
                _singleton_instances[class_name] = instance
            return _singleton_instances[class_name]
        
        def __init__(self, *args, **kwargs):
            # Track initialization per-class in the hierarchy
            my_class_name = original_name  # The class this decorator was applied to
            
            if not hasattr(self, '_initialized_classes'):
                self._initialized_classes = set()
            
            if my_class_name not in self._initialized_classes:
                self._initialized_classes.add(my_class_name)
                # Call the original class __init__, not the wrapper chain
                cls.__init__(self, *args, **kwargs)
    
    SingletonWrapper.__name__ = cls.__name__
    SingletonWrapper.__qualname__ = cls.__qualname__
    SingletonWrapper.__module__ = cls.__module__
    SingletonWrapper.__doc__ = cls.__doc__
    
    return SingletonWrapper


def get_singleton(cls_name: str):
    """Get an existing singleton instance by class name."""
    return _singleton_instances.get(cls_name)


def clear_singletons():
    """Clear all singleton instances (useful for testing)."""
    _singleton_instances.clear()