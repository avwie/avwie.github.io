import * as React from "react"
import DefaultLayout from "../layouts/default";
import {graphql, Link, useStaticQuery} from "gatsby";

const PostItem = ({title, hero, date, excerpt, slug}) => {
    const image = hero.childImageSharp.fixed.src

    return (
        <div className="card col-lg-4">
            <img  className="card-img-top" src={image} />
            <div className="card-body">
                <h5 className="card-title">{ title }</h5>
                <h6 className="card-subtitle mb-2">{ date }</h6>
                <p className="card-text">{ excerpt }</p>
                <Link className="card-link btn btn-primary btn-small" to={slug}>Read more</Link>
            </div>
        </div>
    )
}


const Main = () => {
    const query = useStaticQuery(graphql`
        {
          allMarkdownRemark(sort: {order: DESC, fields: [frontmatter___date]}, limit: 1000) {
            edges {
              node {
                frontmatter {
                  title
                  slug
                  date(formatString: "DD-MMM yyyy")
                  hero {
                    childImageSharp {
                      fixed(width: 430, height: 150) {
                        src
                      }
                    }
                  }
                }
                excerpt(format: MARKDOWN, pruneLength: 230)
              }
            }
          }
        }
    `)

    const posts = query.allMarkdownRemark.edges.map(edge => {
        const data = {
            ...edge.node.frontmatter,
            excerpt: edge.node.excerpt
        }
        return <PostItem {...data} />
    })

    return <>
        <h1 className="text-decoration-underline fs-1 py-2">Hi, welcome to my programming blog.</h1>
        <div className="fs-4 bg-light rounded p-2">
            <div className="col-xl-8">
                    I am an engineer that turned software developer.
                    I enjoy technical challenges and experimenting with techniques and architectures.
                    Some are used successfully in production and some are complete failures. However, all experiments are a
                    way of learning. By posting articles about my experiments I hope that others learn from me, but also that
                    I can learn from others.
            </div>
        </div>
        <h2 className="my-4">Latest posts</h2>
        <div className="container d-flex px-0">
        { posts }
        </div>
    </>
}

const IndexPage = () => {
    return <DefaultLayout><div className="index"><Main /></div></DefaultLayout>
}

export default IndexPage
