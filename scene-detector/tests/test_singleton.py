"""TC-48 to TC-49: SingletonMeta"""

from src.decorators.singleton import SingletonMeta


class TestSingletonMeta:

    def test_same_class_returns_same_instance(self):
        """TC-48: Second instantiation returns the identical object."""

        class MyService(metaclass=SingletonMeta):
            pass

        SingletonMeta._instances.pop(MyService, None)

        inst1 = MyService()
        inst2 = MyService()
        assert inst1 is inst2

    def test_different_classes_get_independent_instances(self):
        """TC-49: Two singleton classes never share an instance."""

        class ServiceA(metaclass=SingletonMeta):
            pass

        class ServiceB(metaclass=SingletonMeta):
            pass

        SingletonMeta._instances.pop(ServiceA, None)
        SingletonMeta._instances.pop(ServiceB, None)

        a = ServiceA()
        b = ServiceB()
        assert a is not b
        assert type(a) is ServiceA
        assert type(b) is ServiceB
