"""
Nexora Structured Logging
Ensures sensitive credentials, JWT secrets, passwords, and reset tokens
are never printed to logs.
"""

import logging
import re
import sys

# Sensitive patterns to redact
SENSITIVE_PATTERNS = [
    (re.compile(r'(password["\':\s=]+)([\w!@#$%^&*()_+=-]+)', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(jwt_access_secret["\':\s=]+)([\w!@#$%^&*()_+=-]+)', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(smtp_password["\':\s=]+)([\w!@#$%^&*()_+=-]+)', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(Bearer\s+)[A-Za-z0-9\-_.]+', re.IGNORECASE), r'\1[REDACTED_TOKEN]'),
    (re.compile(r'(token["\':\s=]+)([A-Za-z0-9\-_]{20,})', re.IGNORECASE), r'\1[REDACTED_TOKEN]'),
    (re.compile(r'(postgresql:\/\/[^:]+:)([^@]+)(@)', re.IGNORECASE), r'\1***\3'),
]


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pattern, repl in SENSITIVE_PATTERNS:
                record.msg = pattern.sub(repl, record.msg)
        if record.args:
            if isinstance(record.args, dict):
                sanitized_args = {}
                for k, v in record.args.items():
                    if isinstance(v, str):
                        for pattern, repl in SENSITIVE_PATTERNS:
                            v = pattern.sub(repl, v)
                    sanitized_args[k] = v
                record.args = sanitized_args
            elif isinstance(record.args, tuple):
                sanitized_args = []
                for v in record.args:
                    if isinstance(v, str):
                        for pattern, repl in SENSITIVE_PATTERNS:
                            v = pattern.sub(repl, v)
                    sanitized_args.append(v)
                record.args = tuple(sanitized_args)
        return True


def setup_logger(name: str = "nexora") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(RedactingFilter())
        logger.addHandler(handler)
        logger.propagate = False
    return logger


logger = setup_logger("nexora")
security_logger = setup_logger("nexora.security")
audit_logger = setup_logger("nexora.audit")
