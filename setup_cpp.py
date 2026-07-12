from setuptools import setup, Extension
import pybind11
import os

sources = [
    'cpp/quoridor_simulator.cpp',
    'cpp/mcts.cpp',
    'cpp/bindings.cpp'
]

ext_modules = [
    Extension(
        'quoridor_cpp',
        sources=sources,
        include_dirs=[
            'cpp',
            pybind11.get_include(),
        ],
        language='c++'
    )
]

setup(
    name='quoridor_cpp',
    ext_modules=ext_modules,
)
