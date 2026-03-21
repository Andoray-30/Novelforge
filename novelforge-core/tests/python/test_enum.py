from enum import Enum

class Test(Enum):
    A = 'test'

print(repr(Test.A.value))
print(type(Test.A.value))
print(Test.A.value.upper())