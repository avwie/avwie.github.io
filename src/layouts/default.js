import * as React from "react"

const DefaultLayout = ({ children }) => {

    return (
        <>
            <nav className="navbar navbar-dark bg-dark">
                <div className="container-lg d-flex">
                    <span className="navbar-brand mt-2 mb-2 h1"><a className="text-decoration-none text-white" href="/">@avwie's programming blog</a></span>
                    <div className="text-light mx-3">
                        <a className="px-2" title="Github" href="https://github.com/avwie" target="_blank" rel="noopener">
                            <img alt="Github" width="24" height="24" src="/layout/github-48.png" />
                        </a>
                        <a className="px-2" title="Mail" href="mailto:info@avwie.nl" target="_blank" rel="noopener">
                            <img alt="Mail" width="24" height="24" src="/layout/mail-48.png" />
                        </a>
                        <a className="px-2" title="Twitter" href="https://twitter.com/avwie" target="_blank" rel="noopener">
                            <img alt="Twitter" width="24" height="24" src="/layout/twitter-48.png" />
                        </a>
                    </div>
                </div>
            </nav>
            <div className="container-lg mt-4">
                { children }
            </div>
        </>
    )
}

export default DefaultLayout